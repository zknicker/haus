import type { LinearTeam } from '@haus/api';
import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    linearAgentSessionsTable,
    linearCredentialsTable,
    linearIdentitiesTable,
} from '../postgres/schema.ts';
import { identityWriteActor } from './identity-write-actor.ts';
import {
    identityActor,
    type LinearActor,
    type LinearActorContext,
    workspaceActor,
} from './linear-actor.ts';
import { membershipWriteActor } from './membership-actor.ts';
import {
    type LinearTeamCache,
    type LinearToolAccess,
    resolveTargetTeams,
    type TargetTeams,
} from './target-teams.ts';
import {
    effectiveIdentityTeams,
    readTeamAccess,
    writeMemberTeamIds,
    writeTeams,
} from './team-access.ts';
import type { LinearToolRefusal } from './tool-results.ts';

// Choosing the actor (specs/linear-app.md#choosing-the-actor). The Agent never
// names one: the Server resolves (connection, Agent, target teams) per call.
// A multi-team write never splits across actors.

/** The chosen actor plus what only `whoami` and `reply` carry in `_meta`. */
export interface LinearActorChoice {
    actor: LinearActor;
    self?: { identityHandle: string | null };
    session?: { linearSessionId: string };
    /** A write's resolved target teams. */
    targetTeams?: LinearTeam[];
}

/** What choosing needs beyond the loaded context: the team cache and a workspace token. */
export interface LinearTargetReader {
    cache: LinearTeamCache;
    transport: typeof fetch;
    workspaceToken(): Promise<string>;
}

/** The actor for one tool call, or why the Server refuses it. */
export async function chooseLinearActor(
    db: HausDatabase,
    reader: LinearTargetReader,
    input: {
        access: LinearToolAccess;
        agentId: string;
        args: Record<string, unknown>;
        context: LinearActorContext;
        workspaceId: string;
    }
): Promise<LinearActorChoice | LinearToolRefusal> {
    const { access, context } = input;
    const resolve = (
        targets: LinearToolAccess & { kind: 'write' },
        args: Record<string, unknown>
    ) =>
        resolveTargetTeams({
            ...reader,
            access: targets,
            args,
            workspaceId: input.workspaceId,
            workspaceTeams: context.workspace.teams,
        });
    switch (access.kind) {
        case 'read':
            return { actor: readActor(context) };
        case 'self':
            return {
                actor: selfActor(context),
                self: { identityHandle: context.identity?.handle ?? null },
            };
        case 'session': {
            const handle = input.args[access.arg];
            const session =
                typeof handle === 'string'
                    ? await readSession(db, input.workspaceId, handle)
                    : null;
            if (!session) {
                return { refused: 'linear_session_not_yours' };
            }
            // Only an identity session needs its issue's team: it never falls back.
            const issue = session.identityId
                ? await resolve(
                      { kind: 'write', targets: [{ arg: 'issue', kind: 'issue' }] },
                      { issue: session.issueId }
                  )
                : null;
            const issueTeamId = issue?.kind === 'teams' ? (issue.teams[0]?.id ?? null) : null;
            const actor = sessionActor(context, session, { agentId: input.agentId, issueTeamId });
            return 'refused' in actor
                ? actor
                : { actor, session: { linearSessionId: session.linearSessionId } };
        }
        case 'write':
            return writeChoice(context, access, await resolve(access, input.args));
        default:
            throw new Error('Unknown Linear tool access.');
    }
}

/** Reads go through the workspace actor: they look the same to every Agent. */
export function readActor(context: LinearActorContext): LinearActor {
    return workspaceActor(context, null);
}

/**
 * A write whose target teams are all inside workspace access. An Agent with
 * an identity writes as it, or is refused when a target team is outside its
 * effective access; it never falls back to the Haus app. An Agent without one
 * writes through the workspace actor posting as the Agent. Team settings
 * writes also need membership (`membershipWriteActor`).
 */
export function writeActor(
    context: LinearActorContext,
    targetTeams: readonly LinearTeam[]
): LinearActor | LinearToolRefusal {
    const { identity } = context;
    if (identity) {
        return identityWriteActor(context, identity, targetTeams, { membership: false });
    }
    return workspaceActor(context, context.agentName);
}

/** `whoami` answers as the actor the Agent writes as by default. */
export function selfActor(context: LinearActorContext): LinearActor {
    return context.identity
        ? identityActor(context.identity)
        : workspaceActor(context, context.agentName);
}

/**
 * A session `reply` posts as the actor that owns the session, never a
 * fallback. `issueTeamId` is the session issue's team, when known.
 */
export function sessionActor(
    context: LinearActorContext,
    session: { agentId: string | null; identityId: string | null; status: string },
    input: { agentId: string; issueTeamId: string | null }
): LinearActor | LinearToolRefusal {
    if (session.agentId !== input.agentId) {
        return { refused: 'linear_session_not_yours' };
    }
    if (session.status !== 'active' && session.status !== 'complete') {
        return { refused: 'linear_session_closed' };
    }
    if (!session.identityId) {
        return workspaceActor(context, null);
    }
    const { identity } = context;
    const effective = identity
        ? effectiveIdentityTeams(identity.teams, context.workspace.teams)
        : [];
    if (
        !identity ||
        identity.id !== session.identityId ||
        !effective.some((team) => team.id === input.issueTeamId)
    ) {
        return { refused: 'linear_session_actor_unavailable' };
    }
    return identityActor(identity);
}

/** Loads the workspace actor and the Agent's usable identity, or null when the workspace actor cannot act. */
export async function loadActorContext(
    db: HausDatabase,
    input: {
        agentId: string;
        now: Date;
        serverId: string;
        workspaceAppUserId: string;
        workspaceId: string;
    }
): Promise<LinearActorContext | null> {
    const [agent] = await db
        .select({ displayName: agentsTable.displayName })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
        .limit(1);
    const [workspace] = await db
        .select()
        .from(linearCredentialsTable)
        .where(
            and(
                eq(linearCredentialsTable.workspaceId, input.workspaceId),
                isNull(linearCredentialsTable.identityId)
            )
        )
        .limit(1);
    if (!(agent && workspace) || workspace.state !== 'valid') {
        return null;
    }
    const [identity] = await db
        .select({
            appUserId: linearIdentitiesTable.appUserId,
            credentialId: linearCredentialsTable.id,
            credentialState: linearCredentialsTable.state,
            handle: linearIdentitiesTable.handle,
            id: linearIdentitiesTable.id,
        })
        .from(linearIdentitiesTable)
        .innerJoin(
            linearCredentialsTable,
            eq(linearCredentialsTable.identityId, linearIdentitiesTable.id)
        )
        .where(
            and(
                eq(linearIdentitiesTable.workspaceId, input.workspaceId),
                eq(linearIdentitiesTable.agentId, input.agentId),
                eq(linearIdentitiesTable.status, 'active')
            )
        )
        .limit(1);
    const workspaceAccess = await readTeamAccess(db, workspace.id, input.now);
    const usable =
        identity?.appUserId && identity.handle && identity.credentialState === 'valid'
            ? { ...identity, appUserId: identity.appUserId, handle: identity.handle }
            : null;
    const identityAccess = usable ? await readTeamAccess(db, usable.credentialId, input.now) : null;
    return {
        agentName: agent.displayName,
        identity: usable &&
            identityAccess && {
                appUserId: usable.appUserId,
                credentialId: usable.credentialId,
                handle: usable.handle,
                id: usable.id,
                memberTeamIds: writeMemberTeamIds(identityAccess),
                teams: writeTeams(identityAccess),
            },
        workspace: {
            appUserId: input.workspaceAppUserId,
            credentialId: workspace.id,
            memberTeamIds: writeMemberTeamIds(workspaceAccess),
            teams: writeTeams(workspaceAccess),
        },
    };
}

/** One session by its Haus handle, scoped to the workspace. */
export async function readSession(db: HausDatabase, workspaceId: string, handle: string) {
    const [session] = await db
        .select()
        .from(linearAgentSessionsTable)
        .where(
            and(
                eq(linearAgentSessionsTable.workspaceId, workspaceId),
                eq(linearAgentSessionsTable.id, handle)
            )
        )
        .limit(1);
    return session ?? null;
}

/** A write's actor once its target teams are resolved; membership writes need a member. */
function writeChoice(
    context: LinearActorContext,
    access: LinearToolAccess & { kind: 'write' },
    targets: TargetTeams
): LinearActorChoice | LinearToolRefusal {
    if (targets.kind === 'outside_access') {
        return { refused: 'linear_team_outside_access' };
    }
    if (targets.kind === 'not_found') {
        return {
            detail: `Name the ${targets.arg} this tool should act on.`,
            refused: 'linear_input_error',
        };
    }
    const actor = access.membership
        ? membershipWriteActor(context, targets.teams)
        : writeActor(context, targets.teams);
    return 'refused' in actor ? actor : { actor, targetTeams: targets.teams };
}
