import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/** One Reminder's past runs, oldest first as the Server returns them. Read only while its detail is open. */
export function useReminderRuns(serverId: string, reminderId: string, enabled: boolean) {
    return hausTrpc.reminder.runs.useQuery(
        { reminderId, serverId },
        { ...queryPolicy.syncedSnapshot, enabled }
    );
}
