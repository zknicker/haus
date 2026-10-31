import type { LinearTrigger } from '@haus/api';
import { eq } from 'drizzle-orm';
import type { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { enqueueInboxItem, ensureDeliveryState } from '../src/agent-delivery/store.ts';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { agentsTable, linearTeamAccessTable, usersTable } from '../src/postgres/schema.ts';
import { createOperatorTrigger } from '../src/triggers/operator-trigger-create.ts';
import type { TriggerAuthoringServices } from '../src/triggers/operator-triggers.ts';
import type { HausUser } from '../src/users/haus-user.ts';
import {
    desTeamId,
    type LinearSessionWorld,
    seedLinearSessionWorld,
} from './linear-session-seed.ts';

// A Linear workspace with two accessible teams (DES, OPS), a faked Linear
// GraphQL catalog, and helpers that author `linear` Triggers the way the
// operator procedures do.

export const opsTeamId = 'team-ops';
export const states = {
    changesRequested: 'state-des-changes',
    designReview: 'state-des-review',
    opsReview: 'state-ops-review',
} as const;
export const labels = { bug: 'label-des-bug', workspaceBug: 'label-ws-bug' } as const;
export const people = { samA: 'user-sam-a', samB: 'user-sam-b' } as const;
export const projectId = 'project-atlas';
export const projectUrl = 'https://linear.app/haus/project/atlas-0123456789ab';
export const clock = { now: () => new Date() };

export interface LinearTriggerWorld extends LinearSessionWorld {
    handles: { beacon: string; juniper: string };
    member: HausUser;
}

export async function seedLinearTriggerWorld(db: HausDatabase): Promise<LinearTriggerWorld> {
    const world = await seedLinearSessionWorld(db);
    await db.insert(linearTeamAccessTable).values({
        credentialId: world.credentialId,
        serverId: world.serverId,
        syncedAt: new Date(),
        teamId: opsTeamId,
        teamKey: 'OPS',
        teamName: 'Operations',
    });
    const [binder] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.id, world.binderUserId));
    if (!binder) {
        throw new Error('The binder was not seeded.');
    }
    return {
        ...world,
        handles: {
            beacon: await handleOf(db, world.agents.beacon),
            juniper: await handleOf(db, world.agents.juniper),
        },
        member: binder,
    };
}

/** The workspace objects the faked Linear lists; `renamed` renames a state after authoring. */
export function linearCatalog(world: LinearSessionWorld, options: { renamed?: boolean } = {}) {
    const page = <T>(nodes: T[]) => ({ nodes, pageInfo: { hasNextPage: false } });
    return {
        issueLabels: page([
            { id: 'label-agent-group', isGroup: true, name: 'Agent', team: { id: desTeamId } },
            { id: world.labels.juniper, isGroup: false, name: 'Juniper', team: { id: desTeamId } },
            { id: labels.bug, isGroup: false, name: 'Bug', team: { id: desTeamId } },
            { id: labels.workspaceBug, isGroup: false, name: 'Bug', team: null },
        ]),
        projectStatuses: page([{ id: 'status-started', name: 'In Progress' }]),
        projects: page([
            {
                id: projectId,
                name: 'Atlas',
                teams: { nodes: [{ id: desTeamId }] },
                url: projectUrl,
            },
        ]),
        users: page([
            { displayName: 'sam', email: 'sam.a@example.com', id: people.samA, name: 'Sam' },
            { displayName: 'sammy', email: 'sam.b@example.com', id: people.samB, name: 'Sam' },
        ]),
        workflowStates: page([
            {
                id: states.designReview,
                name: options.renamed ? 'Design Critique' : 'Design Review',
                team: { id: desTeamId },
                type: 'started',
            },
            {
                id: states.changesRequested,
                name: 'Changes Requested',
                team: { id: desTeamId },
                type: 'started',
            },
            {
                id: states.opsReview,
                name: 'Design Review',
                team: { id: opsTeamId },
                type: 'started',
            },
        ]),
    };
}

/** A faked Linear GraphQL endpoint: the Trigger catalog and comment issue reads. */
export function fakeLinear(
    world: LinearSessionWorld,
    issues: Record<string, unknown> = {},
    calls: string[] = []
): typeof fetch {
    const transport = async (_url: string | URL | Request, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as {
            query: string;
            variables?: { id?: string };
        };
        const name = /query (\w+)/u.exec(request.query)?.[1] ?? 'unknown';
        calls.push(name);
        if (name === 'HausTriggerCatalog') {
            return Response.json({ data: linearCatalog(world) });
        }
        if (name === 'HausTriggerCommentIssue') {
            const issue = issues[request.variables?.id ?? ''];
            return issue
                ? Response.json({ data: { issue } })
                : Response.json({
                      errors: [{ extensions: { type: 'invalid input' }, message: 'nope' }],
                  });
        }
        return new Response('unexpected query', { status: 500 });
    };
    return transport as typeof fetch;
}

export function authoringServices(
    db: HausDatabase,
    transport: typeof fetch
): TriggerAuthoringServices {
    return {
        githubTransport: {},
        linear: { accessToken: async () => 'linear-test-token', db, fetch: transport },
    };
}

/** Authors one `linear` Trigger as a Server Owner would. */
export async function createLinearTrigger(
    db: HausDatabase,
    world: LinearTriggerWorld,
    input: { agentId?: string; groups: unknown[]; title?: string },
    transport: typeof fetch = fakeLinear(world)
): Promise<LinearTrigger> {
    const created = await createOperatorTrigger(
        db,
        world.member,
        {
            agentId: input.agentId ?? world.agents.juniper,
            kind: 'linear',
            linear: {
                connectionId: world.connectionId,
                groups: input.groups as never,
            },
            origin: 'https://app.haus.test',
            serverId: world.serverId,
            title: input.title ?? 'Design review',
        },
        clock,
        authoringServices(db, transport)
    );
    if (created.trigger.kind !== 'linear') {
        throw new Error('Expected a Linear Trigger.');
    }
    return created.trigger;
}

/** Writes inbox rows like the real ledger, without dispatching to a Computer. */
export const inboxDelivery: Pick<AgentDelivery, 'enqueue'> = {
    enqueue: async (tx, input) => {
        await ensureDeliveryState(tx, input);
        await enqueueInboxItem(tx, { ...input, source: input.source ?? 'human' });
    },
};

async function handleOf(db: HausDatabase, agentId: string): Promise<string> {
    const [agent] = await db
        .select({ handle: agentsTable.handle })
        .from(agentsTable)
        .where(eq(agentsTable.id, agentId));
    if (!agent) {
        throw new Error(`Agent ${agentId} was not seeded.`);
    }
    return agent.handle;
}
