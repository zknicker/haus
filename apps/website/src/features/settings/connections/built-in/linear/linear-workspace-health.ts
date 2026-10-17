import type { LinearTeam, LinearWorkspace } from '@haus/api';
import { formatRelativeTime } from '../../../../../lib/format.ts';
import { notMemberOfTeams } from './linear-team-names.ts';

const hourMs = 60 * 60 * 1000;
/** The Server treats a team set older than this as empty for writes. */
const teamAccessMaxAgeMs = 24 * hourMs;
/** A quiet week is when a silent webhook is worth a look. */
const staleDeliveryMs = 7 * 24 * hourMs;

export interface LinearWorkspaceHealth {
    /**
     * Last delivery, shown only when it is worth a look: the workspace is
     * failing, or Linear has been silent long enough that its webhook may be
     * disabled. Null while healthy.
     */
    lastDelivery: string | null;
    /**
     * Team settings writes (statuses, labels) need membership: the reachable
     * teams the Haus app is not a member of, in `teams` order. Empty without
     * team access, which already says no write lands.
     */
    missingMemberTeams: LinearTeam[];
    /** Every write is refused while the Haus app reaches no team. */
    teamAccess: 'none' | 'ok';
}

/**
 * What the workspace card needs to flag (specs/linear-app.md#team-scope and
 * #disabled-webhooks). Haus cannot see a disabled webhook, so staleness is
 * the only signal; a workspace that never received a delivery is new, not
 * stale, unless it is also failing.
 */
export function linearWorkspaceHealth(
    workspace: Pick<
        LinearWorkspace,
        'lastDeliveryAt' | 'memberTeamIds' | 'status' | 'teams' | 'teamsSyncedAt'
    >,
    now = Date.now()
): LinearWorkspaceHealth {
    const syncedTooLongAgo =
        workspace.teamsSyncedAt !== null &&
        now - Date.parse(workspace.teamsSyncedAt) > teamAccessMaxAgeMs;
    const failing = workspace.status !== 'active';
    const stale =
        workspace.lastDeliveryAt !== null &&
        now - Date.parse(workspace.lastDeliveryAt) > staleDeliveryMs;

    const teamAccess = workspace.teams.length === 0 || syncedTooLongAgo ? 'none' : 'ok';

    return {
        lastDelivery:
            failing || stale
                ? workspace.lastDeliveryAt
                    ? formatRelativeTime(workspace.lastDeliveryAt, now)
                    : 'Never'
                : null,
        // Without team access the card already says no write lands; one warning per fact.
        missingMemberTeams:
            teamAccess === 'ok'
                ? workspace.teams.filter((team) => !workspace.memberTeamIds.includes(team.id))
                : [],
        teamAccess,
    };
}

/**
 * The Team settings warning for a non-empty `missing` list: no membership at
 * all, or the teams still missing it ("Not a member of Design, Ops +1").
 */
export function linearTeamSettingsWarning(
    missing: readonly LinearTeam[],
    teams: readonly LinearTeam[]
): string {
    return missing.length === teams.length
        ? "Haus isn't a member of any team"
        : notMemberOfTeams(missing.map((team) => team.name || team.key));
}

/**
 * Linear's settings page for the workspace's installed applications, where an
 * admin opens the Haus app and changes which teams it can reach
 * (linear.app/developers/oauth-2-0-authentication, "app details page").
 * A reconnect of the installed app skips Linear's team choice, so it is not
 * the way to change teams.
 */
export function linearApplicationsSettingsUrl(urlKey: string): string {
    return `https://linear.app/${encodeURIComponent(urlKey)}/settings/applications`;
}
