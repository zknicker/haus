import type { LinearWorkspace } from '@haus/api';
import { formatRelativeTime } from '../../../../../lib/format.ts';

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
    workspace: Pick<LinearWorkspace, 'lastDeliveryAt' | 'status' | 'teams' | 'teamsSyncedAt'>,
    now = Date.now()
): LinearWorkspaceHealth {
    const syncedTooLongAgo =
        workspace.teamsSyncedAt !== null &&
        now - Date.parse(workspace.teamsSyncedAt) > teamAccessMaxAgeMs;
    const failing = workspace.status !== 'active';
    const stale =
        workspace.lastDeliveryAt !== null &&
        now - Date.parse(workspace.lastDeliveryAt) > staleDeliveryMs;

    return {
        lastDelivery:
            failing || stale
                ? workspace.lastDeliveryAt
                    ? formatRelativeTime(workspace.lastDeliveryAt, now)
                    : 'Never'
                : null,
        teamAccess: workspace.teams.length === 0 || syncedTooLongAgo ? 'none' : 'ok',
    };
}
