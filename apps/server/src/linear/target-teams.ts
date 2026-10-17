import type { LinearTeam } from '@haus/api';
import * as z from 'zod';
import { linearGraphql } from './linear-api.ts';
import { findTeam } from './team-access.ts';

// Target teams (specs/linear-app.md#choosing-the-actor): the teams one write
// touches, read before the call so the Server can choose its actor. Each write
// tool declares which arguments name its targets; entity teams come from a
// five-minute cache keyed by entity id, else one workspace-token read.

type TargetKind = 'issue' | 'label' | 'project' | 'state' | 'team';

interface TargetArgument {
    arg: string;
    kind: TargetKind;
    /** Absent means the write touches no team through this argument. */
    optional?: boolean;
}

/** How one connector tool reaches Linear; unlisted tools are refused. */
export type LinearToolAccess =
    | { kind: 'read' }
    | { kind: 'self' }
    | { kind: 'session'; arg: 'session' }
    | {
          kind: 'write';
          /**
           * A team settings write: the actor must be a member of every target
           * team, not only reach it (specs/linear-app.md#choosing-the-actor).
           */
          membership?: true;
          targets: readonly TargetArgument[];
      };

const read = { kind: 'read' } as const;
const issue = { arg: 'issue', kind: 'issue' } as const;
const state = { arg: 'state', kind: 'state' } as const;

export const linearToolAccess: Readonly<Record<string, LinearToolAccess>> = {
    archive_workflow_state: { kind: 'write', membership: true, targets: [state] },
    create_comment: { kind: 'write', targets: [issue] },
    create_document: {
        kind: 'write',
        targets: [{ arg: 'project', kind: 'project', optional: true }],
    },
    create_issue: { kind: 'write', targets: [{ arg: 'team', kind: 'team' }] },
    // A workspace label (no team) touches no team, so it needs no membership.
    create_label: {
        kind: 'write',
        membership: true,
        targets: [{ arg: 'team', kind: 'team', optional: true }],
    },
    create_project: { kind: 'write', targets: [{ arg: 'teams', kind: 'team' }] },
    create_workflow_state: {
        kind: 'write',
        membership: true,
        targets: [{ arg: 'team', kind: 'team' }],
    },
    delegate_issue: { kind: 'write', targets: [issue] },
    get_document: read,
    get_issue: read,
    get_project: read,
    list_comments: read,
    list_cycles: read,
    list_labels: read,
    list_projects: read,
    list_teams: read,
    list_users: read,
    list_workflow_states: read,
    reply: { arg: 'session', kind: 'session' },
    search_documents: read,
    search_issues: read,
    // A team move touches both the issue's team and the new one.
    update_issue: {
        kind: 'write',
        targets: [issue, { arg: 'team', kind: 'team', optional: true }],
    },
    update_workflow_state: { kind: 'write', membership: true, targets: [state] },
    upload_image: { kind: 'write', targets: [issue] },
    whoami: { kind: 'self' },
};

export type TargetTeams =
    | { kind: 'teams'; teams: LinearTeam[] }
    | { kind: 'outside_access' }
    | { kind: 'not_found'; arg: string };

const cacheTtlMs = 5 * 60_000;
const cacheCapacity = 5000;

/** Entity id → team ids, per workspace, filled by reads and deliveries. */
export class LinearTeamCache {
    private readonly entries = new Map<string, { expiresAt: number; teamIds: string[] }>();

    constructor(private readonly now: () => number = Date.now) {}

    remember(workspaceId: string, entityId: string, teamIds: readonly string[]): void {
        if (this.entries.size >= cacheCapacity) {
            const [oldest] = this.entries.keys();
            if (oldest !== undefined) {
                this.entries.delete(oldest);
            }
        }
        this.entries.set(`${workspaceId}:${entityId}`, {
            expiresAt: this.now() + cacheTtlMs,
            teamIds: [...teamIds],
        });
    }

    read(workspaceId: string, entityId: string): string[] | undefined {
        const key = `${workspaceId}:${entityId}`;
        const entry = this.entries.get(key);
        if (entry && entry.expiresAt <= this.now()) {
            this.entries.delete(key);
            return undefined;
        }
        return entry?.teamIds;
    }
}

/**
 * The write's target teams, every one inside workspace access, or the reason
 * it cannot run. A write that names no team answers an empty set.
 */
export async function resolveTargetTeams(input: {
    access: LinearToolAccess & { kind: 'write' };
    args: Record<string, unknown>;
    cache: LinearTeamCache;
    transport: typeof fetch;
    workspaceId: string;
    workspaceTeams: readonly LinearTeam[];
    workspaceToken: () => Promise<string>;
}): Promise<TargetTeams> {
    const teamIds: (string | null)[] = [];
    for (const target of input.access.targets) {
        const references = argumentReferences(input.args[target.arg]);
        if (references.length === 0 && !target.optional) {
            return { arg: target.arg, kind: 'not_found' };
        }
        for (const reference of references) {
            // A team the workspace cannot reach resolves to null: outside access.
            const resolved =
                target.kind === 'team'
                    ? [findTeam(input.workspaceTeams, reference)?.id ?? null]
                    : await entityTeams(input, target.kind, reference);
            if (resolved === null) {
                return { arg: target.arg, kind: 'not_found' };
            }
            teamIds.push(...resolved);
        }
    }
    const teams = new Map<string, LinearTeam>();
    for (const teamId of teamIds) {
        const team = teamId === null ? undefined : findTeam(input.workspaceTeams, teamId);
        if (!team) {
            return { kind: 'outside_access' };
        }
        teams.set(team.id, team);
    }
    return { kind: 'teams', teams: [...teams.values()] };
}

const teamRef = z.object({ id: z.string() }).nullable();
const entityQueries: Record<
    Exclude<TargetKind, 'team'>,
    { query: string; schema: z.ZodType<string[] | null> }
> = {
    issue: {
        query: 'query HausIssueTeam($id: String!) { entity: issue(id: $id) { team { id } } }',
        schema: z
            .object({ entity: z.object({ team: teamRef }).nullable() })
            .transform(({ entity }) => (entity ? (entity.team ? [entity.team.id] : []) : null)),
    },
    label: {
        query: 'query HausLabelTeam($id: String!) { entity: issueLabel(id: $id) { team { id } } }',
        schema: z
            .object({ entity: z.object({ team: teamRef }).nullable() })
            .transform(({ entity }) => (entity ? (entity.team ? [entity.team.id] : []) : null)),
    },
    project: {
        query: 'query HausProjectTeams($id: String!) { entity: project(id: $id) { teams { nodes { id } } } }',
        schema: z
            .object({
                entity: z
                    .object({ teams: z.object({ nodes: z.array(z.object({ id: z.string() })) }) })
                    .nullable(),
            })
            .transform(({ entity }) => entity?.teams.nodes.map((team) => team.id) ?? null),
    },
    state: {
        query: 'query HausStateTeam($id: String!) { entity: workflowState(id: $id) { team { id } } }',
        schema: z
            .object({ entity: z.object({ team: teamRef }).nullable() })
            .transform(({ entity }) => (entity ? (entity.team ? [entity.team.id] : []) : null)),
    },
};

/** Null when Linear has no such entity (or the workspace actor cannot see it). */
async function entityTeams(
    input: {
        cache: LinearTeamCache;
        transport: typeof fetch;
        workspaceId: string;
        workspaceToken: () => Promise<string>;
    },
    kind: Exclude<TargetKind, 'team'>,
    reference: string
): Promise<string[] | null> {
    const cached = input.cache.read(input.workspaceId, reference);
    if (cached) {
        return cached;
    }
    const { query, schema } = entityQueries[kind];
    const teamIds = await linearGraphql(
        input.transport,
        await input.workspaceToken(),
        { query, variables: { id: reference } },
        schema
    );
    if (teamIds) {
        input.cache.remember(input.workspaceId, reference, teamIds);
    }
    return teamIds;
}

function argumentReferences(value: unknown): string[] {
    const values = Array.isArray(value) ? value : [value];
    return values.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}
