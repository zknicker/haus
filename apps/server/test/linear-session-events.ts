import { eq } from 'drizzle-orm';
import type { ReadSessionIssueLabels } from '../src/linear/session-issue-labels.ts';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { agentsTable, linearAgentSessionsTable } from '../src/postgres/schema.ts';
import { desTeamId, type LinearSessionWorld } from './linear-session-seed.ts';

// `AgentSessionEvent` bodies shaped like the captures in fixtures/linear/captured/
// (no label ids: routing reads them from the issue), and reads shared by the
// Linear session tests.

export const linearSessionEventAt = new Date('2026-10-15T12:00:00.000Z');

/** Tests that call `apply` hand it label ids directly; `prepare` must not run. */
export const unreadIssueLabels: ReadSessionIssueLabels = () =>
    Promise.reject(new Error('These tests pass label ids to apply directly.'));

export function sessionEvent(
    world: LinearSessionWorld,
    input: {
        action?: 'created' | 'prompted';
        creatorId?: string;
        linearSessionId?: string;
        prompt?: string;
    } = {}
) {
    const action = input.action ?? 'created';
    const mention = action === 'created' && input.prompt !== undefined;
    return {
        action,
        agentActivity:
            action === 'prompted' ? { body: input.prompt, userId: 'human-1' } : undefined,
        agentSession: {
            // As captured: a mention carries the person's comment; a delegation
            // carries Linear's placeholder thread comment and no source metadata.
            comment: mention
                ? { body: input.prompt, userId: 'human-1' }
                : { body: 'This thread is for an agent session with haus.' },
            creator: { id: input.creatorId ?? 'human-1' },
            id: input.linearSessionId ?? crypto.randomUUID(),
            issue: {
                id: 'issue-142',
                identifier: 'DES-142',
                teamId: desTeamId,
                title: 'Moth tee',
                url: 'https://linear.app/haus/issue/DES-142',
            },
            sourceMetadata: mention ? { type: 'comment' } : null,
        },
        appUserId: world.workspaceAppUserId,
        guidance: [{ body: 'Keep designs on brand.' }],
        organizationId: world.organizationId,
        promptContext: '<issue identifier="DES-142"><title>Moth tee</title></issue>',
        type: 'AgentSessionEvent',
        webhookTimestamp: linearSessionEventAt.getTime(),
    };
}

/** The one session row a world's workspace holds. */
export async function sessionFor(db: HausDatabase, world: LinearSessionWorld) {
    const [session] = await db
        .select()
        .from(linearAgentSessionsTable)
        .where(eq(linearAgentSessionsTable.workspaceId, world.workspaceId));
    return session;
}

export async function agentHandle(db: HausDatabase, agentId: string): Promise<string> {
    const [agent] = await db
        .select({ handle: agentsTable.handle })
        .from(agentsTable)
        .where(eq(agentsTable.id, agentId));
    return agent?.handle ?? '';
}
