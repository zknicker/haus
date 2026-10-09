import { isKnownTimeZone } from '../../features/members/agent-profile/reminder-cadence.ts';
import { useMembers } from '../servers/use-members.ts';

/**
 * The zone the viewer reads times in: their saved Profile timezone, else this
 * device's zone while it is blank, unrecognized, or still loading.
 */
export function useViewerTimeZone(serverId: string): string {
    const directory = useMembers(serverId);
    const saved = directory.data?.members.find(
        (member) => member.userId === directory.data.viewerUserId
    )?.timezone;
    return saved && isKnownTimeZone(saved) ? saved : deviceTimeZone();
}

export function deviceTimeZone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
