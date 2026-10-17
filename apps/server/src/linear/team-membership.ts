import * as z from 'zod';
import type { HausDatabase } from '../postgres/connection.ts';
import { serializeCredentialSync } from './credential-sync-queue.ts';
import { LinearApiError, linearGraphql } from './linear-api.ts';
import type { LinearTeamReach } from './linear-install-reads.ts';
import { markTeamMembers, readWorkspaceTeamAccess, writeMemberTeamIds } from './team-access.ts';

// Identity team membership (specs/linear-app.md#team-scope). An identity joins
// exactly the teams the Haus app is a member of, never more: a workspace admin
// decides which teams' settings Haus may change by adding the Haus app, and an
// identity follows that choice. Each join is the identity adding itself
// (`teamMembershipCreate` with its own token and app user), tried at most once
// per team per sync; a refused join is logged and never fails the sync.

const joinMutation =
    'mutation HausJoinTeam($input: TeamMembershipCreateInput!) { teamMembershipCreate(input: $input) { success } }';
const joinResultSchema = z.object({ teamMembershipCreate: z.object({ success: z.boolean() }) });

export interface IdentityTeamJoin {
    /** The identity's app user (`linear_identities.app_user_id`). */
    appUserId: string;
    db: HausDatabase;
    fetch: typeof fetch;
    now: Date;
    /** What the identity's token reaches, just read from Linear. */
    reach: readonly LinearTeamReach[];
    /** The identity's access token. */
    token: string;
    workspaceId: string;
}

/**
 * Joins every team the Haus app is a member of (fresh rows) that the identity
 * reaches, is not yet a member of, and may join. Answers the reach with joined
 * teams marked member, ready to persist.
 */
export async function joinHausMemberTeams(input: IdentityTeamJoin): Promise<LinearTeamReach[]> {
    const workspace = await readWorkspaceTeamAccess(input.db, input.workspaceId, input.now);
    const hausMembers = new Set(workspace ? writeMemberTeamIds(workspace) : []);
    const joined = new Set<string>();
    for (const team of input.reach) {
        if (team.member || !team.canJoin || !hausMembers.has(team.id) || joined.has(team.id)) {
            continue;
        }
        if (await joinTeam(input, team.id)) {
            joined.add(team.id);
        }
    }
    return input.reach.map((team) => (joined.has(team.id) ? { ...team, member: true } : team));
}

/**
 * The same join right after an identity install binds, against the team access
 * the bind just stored, serialized with that credential's syncs. Never throws:
 * the install already committed.
 */
export async function joinTeamsAfterIdentityInstall(
    input: IdentityTeamJoin & { credentialId: string }
): Promise<void> {
    try {
        await serializeCredentialSync(input.credentialId, async () => {
            const reach = await joinHausMemberTeams(input);
            const before = new Set(
                input.reach.filter((team) => team.member).map((team) => team.id)
            );
            await markTeamMembers(input.db, {
                credentialId: input.credentialId,
                teamIds: reach
                    .filter((team) => team.member && !before.has(team.id))
                    .map((team) => team.id),
            });
        });
    } catch (cause) {
        console.error(
            '[haus] Linear identity team join after install failed',
            cause instanceof Error ? cause.name : 'unknown error'
        );
    }
}

async function joinTeam(input: IdentityTeamJoin, teamId: string): Promise<boolean> {
    try {
        const result = await linearGraphql(
            input.fetch,
            input.token,
            { query: joinMutation, variables: { input: { teamId, userId: input.appUserId } } },
            joinResultSchema
        );
        if (!result.teamMembershipCreate.success) {
            console.error('[haus] Linear refused an identity team join', teamId, 'success: false');
        }
        return result.teamMembershipCreate.success;
    } catch (cause) {
        console.error(
            '[haus] Linear refused an identity team join',
            teamId,
            cause instanceof LinearApiError ? cause.failure : 'unknown error'
        );
        return false;
    }
}
