import { isKnownTimeZone } from '../../features/members/agent-profile/reminder-cadence.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * The zone the viewer reads times in: their saved Profile timezone, else this
 * device's zone while it is blank, unrecognized, or still loading.
 */
export function useViewerTimeZone(serverId: string): string {
    const saved = hausTrpc.member.list.useQuery(
        { serverId },
        {
            ...queryPolicy.syncedSnapshot,
            select: (directory) =>
                directory.members.find((member) => member.userId === directory.viewerUserId)
                    ?.timezone ?? null,
        }
    ).data;
    return resolveViewerTimeZone(saved);
}

export function resolveViewerTimeZone(saved: string | null | undefined): string {
    return saved && isKnownTimeZone(saved)
        ? saved
        : Intl.DateTimeFormat().resolvedOptions().timeZone;
}
