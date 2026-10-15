import type {
    LinearTeam,
    LinearTriggerDisplay,
    LinearTriggerGroup,
    LinearTriggerGroups,
    linearTriggerConfigInputSchema,
    linearTriggerGroupsInputSchema,
} from '@haus/api';
import type * as z from 'zod';
import { TriggerRequestRefusedError } from '../triggers/trigger-model.ts';
import type { LinearCatalog } from './trigger-catalog.ts';

// Authoring inputs → stable ids (specs/linear-triggers.md#stable-ids). Names,
// keys, URLs, emails, and Agent selectors resolve against the catalog read
// before the transaction; ambiguity and absence are refusals that name the
// fix. Renames never matter afterwards: only ids are stored.

export type LinearTriggerGroupsAuthoring = z.output<typeof linearTriggerGroupsInputSchema>;
export type LinearTriggerConfigAuthoring = z.output<typeof linearTriggerConfigInputSchema>;
type AuthoringGroup = LinearTriggerGroupsAuthoring[number];

/** An Agent that holds the grant on the workspace's connection. */
export interface LinearGrantedAgent {
    handle: string;
    id: string;
}

export interface LinearReferenceScope {
    catalog: LinearCatalog;
    /** Agents granted on the connection; `@agent:<handle>` must name one. */
    grantedAgents: readonly LinearGrantedAgent[];
    ownerAgentId: string;
    /** The workspace actor's team access. */
    teams: readonly LinearTeam[];
}

/** Resolves every group, collecting a display name for each stored id. */
export function resolveLinearTriggerGroups(
    groups: LinearTriggerGroupsAuthoring,
    scope: LinearReferenceScope
): { display: LinearTriggerDisplay; groups: LinearTriggerGroups } {
    const display: LinearTriggerDisplay = {};
    const resolved = groups.map((group) => resolveGroup(group, scope, display));
    return { display, groups: resolved as LinearTriggerGroups };
}

function resolveGroup(
    group: AuthoringGroup,
    scope: LinearReferenceScope,
    display: LinearTriggerDisplay
): LinearTriggerGroup {
    const teams = group.teams?.map((input) => resolveTeam(input, scope.teams, display));
    const scopeTeams = new Set((teams ?? scope.teams.map((team) => team.id)) as string[]);
    const refs = (list: string[] | undefined, resolve: (input: string) => string) =>
        list ? [...new Set(list.map(resolve))] : undefined;
    const label = (input: string) => resolveLabel(input, scope, scopeTeams, display);
    const agent = (input: string) => ({ agent: resolveAgent(input, scope, display) });
    const actor = (input: string) =>
        input.startsWith('@') ? agent(input) : { linearUser: resolveUser(input, scope, display) };
    const common = {
        actions: group.actions,
        actors: group.actors?.map(actor),
        actorsIgnore: group.actorsIgnore?.map(actor),
        assignees: refs(group.assignees, (input) => resolveUser(input, scope, display)),
        delegates: group.delegates?.map(agent),
        labels: refs(group.labels, label),
        labelsIgnore: refs(group.labelsIgnore, label),
        projects: refs(group.projects, (input) => resolveProject(input, scope, display)),
        teams,
    };
    const state = (input: string) => resolveState(input, scope, scopeTeams, display);
    switch (group.event) {
        case 'issue':
            return withoutUndefined({
                ...common,
                changed: group.changed,
                event: 'issue',
                stateFrom: refs(group.stateFrom, state),
                stateTo: refs(group.stateTo, state),
                stateTypes: group.stateTypes,
            }) as LinearTriggerGroup;
        case 'comment':
            return withoutUndefined({
                ...common,
                event: 'comment',
                onIssueDelegatedTo: group.onIssueDelegatedTo?.map(agent),
            }) as LinearTriggerGroup;
        default:
            return withoutUndefined({
                ...common,
                changed: group.changed,
                event: 'project',
                projectStatuses: refs(group.projectStatuses, (input) =>
                    resolveNamed('project status', input, scope.catalog.projectStatuses, display)
                ),
            }) as LinearTriggerGroup;
    }
}

function resolveTeam(
    input: string,
    teams: readonly LinearTeam[],
    display: LinearTriggerDisplay
): string {
    const lowered = input.toLowerCase();
    const team = teams.find(
        (candidate) =>
            candidate.id === input ||
            candidate.key.toLowerCase() === lowered ||
            candidate.name.toLowerCase() === lowered
    );
    if (!team) {
        throw new TriggerRequestRefusedError(
            'linear_team_outside_access',
            `Team "${input}" is not in the Haus app's team access. Use one of: ${teams.map((candidate) => candidate.key).join(', ') || 'none'}; a Linear admin can grant the Haus app more teams.`
        );
    }
    display[team.id] = team.key;
    return team.id;
}

function resolveLabel(
    input: string,
    scope: LinearReferenceScope,
    scopeTeams: ReadonlySet<string>,
    display: LinearTriggerDisplay
): string {
    const candidates = byNameOrId(scope.catalog.labels, input);
    const teamLabels = candidates.filter((label) => label.teamId && scopeTeams.has(label.teamId));
    // A team label wins over a workspace label of the same name.
    const chosen =
        teamLabels.length > 0 ? teamLabels : candidates.filter((label) => label.teamId === null);
    return single('label', input, chosen, scope.teams, display, (label) => label.teamId);
}

function resolveState(
    input: string,
    scope: LinearReferenceScope,
    scopeTeams: ReadonlySet<string>,
    display: LinearTriggerDisplay
): string {
    const candidates = byNameOrId(scope.catalog.states, input).filter((state) =>
        scopeTeams.has(state.teamId)
    );
    return single(
        'workflow state',
        input,
        candidates,
        scope.teams,
        display,
        (state) => state.teamId
    );
}

function resolveProject(
    input: string,
    scope: LinearReferenceScope,
    display: LinearTriggerDisplay
): string {
    const url = normalizedUrl(input);
    const candidates = url
        ? scope.catalog.projects.filter((project) => normalizedUrl(project.url) === url)
        : byNameOrId(scope.catalog.projects, input);
    return single('project', input, candidates, scope.teams, display, () => null);
}

function resolveUser(
    input: string,
    scope: LinearReferenceScope,
    display: LinearTriggerDisplay
): string {
    const lowered = input.toLowerCase();
    const byEmail = scope.catalog.users.filter((user) => user.email?.toLowerCase() === lowered);
    const candidates =
        byEmail.length > 0
            ? byEmail
            : scope.catalog.users.filter(
                  (user) =>
                      user.id === input ||
                      user.name.toLowerCase() === lowered ||
                      user.displayName.toLowerCase() === lowered
              );
    return single('Linear user', input, candidates, scope.teams, display, () => null);
}

function resolveAgent(
    input: string,
    scope: LinearReferenceScope,
    display: LinearTriggerDisplay
): string {
    if (input === '@self') {
        const owner = scope.grantedAgents.find((agent) => agent.id === scope.ownerAgentId);
        display[scope.ownerAgentId] = owner ? `@${owner.handle}` : '@self';
        return scope.ownerAgentId;
    }
    const handle = input.replace(/^@agent:/u, '').toLowerCase();
    const agent = scope.grantedAgents.find(
        (candidate) => candidate.handle.toLowerCase() === handle
    );
    if (!agent) {
        throw new TriggerRequestRefusedError(
            'linear_reference_unavailable',
            `${input} is not an Agent with access to this Linear connection. Name a granted Agent as @agent:<handle>, or @self.`
        );
    }
    display[agent.id] = `@${agent.handle}`;
    return agent.id;
}

function resolveNamed(
    kind: string,
    input: string,
    list: readonly { id: string; name: string }[],
    display: LinearTriggerDisplay
): string {
    return single(kind, input, byNameOrId(list, input), [], display, () => null);
}

function byNameOrId<T extends { id: string; name: string }>(list: readonly T[], input: string) {
    const lowered = input.toLowerCase();
    return list.filter((item) => item.id === input || item.name.toLowerCase() === lowered);
}

/** Exactly one distinct id, or a refusal naming the candidates. */
function single<T extends { id: string; name: string }>(
    kind: string,
    input: string,
    candidates: readonly T[],
    teams: readonly LinearTeam[],
    display: LinearTriggerDisplay,
    teamOf: (candidate: T) => string | null
): string {
    const distinct = [
        ...new Map(candidates.map((candidate) => [candidate.id, candidate])).values(),
    ];
    const [only] = distinct;
    if (distinct.length === 1 && only) {
        display[only.id] = only.name;
        return only.id;
    }
    if (distinct.length === 0) {
        throw new TriggerRequestRefusedError(
            'linear_reference_unavailable',
            `No ${kind} named "${input}" is reachable in this workspace${kind === 'workflow state' || kind === 'label' ? ' within the selected teams' : ''}.`
        );
    }
    const keyOf = (teamId: string | null) =>
        teamId ? (teams.find((team) => team.id === teamId)?.key ?? teamId) : null;
    const listed = distinct.map((candidate) => {
        const key = keyOf(teamOf(candidate));
        return key ? `${candidate.name} (${key})` : `${candidate.name} [${candidate.id}]`;
    });
    throw new TriggerRequestRefusedError(
        'linear_reference_ambiguous',
        `"${input}" names ${distinct.length} ${kind}s: ${listed.join(', ')}. Narrow the group with teams, or pass the id.`
    );
}

function normalizedUrl(value: string): string | null {
    if (!URL.canParse(value)) {
        return null;
    }
    const url = new URL(value);
    return `${url.host}${url.pathname.replace(/\/+$/u, '')}`.toLowerCase();
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
    return Object.fromEntries(
        Object.entries(value).filter(([, entry]) => entry !== undefined)
    ) as T;
}
