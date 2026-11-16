import { hausTrpc } from '../../lib/haus-server.tsx';
import { dropTaskInboxItem } from './task-inbox-cache.ts';

/**
 * Mark read, or opening the Task. The item leaves at once;
 * `taskInbox.onChanged` refreshes the list, and a failure re-reads it.
 */
export function useClearTaskInboxItem() {
    const utils = hausTrpc.useUtils();
    return hausTrpc.taskInbox.clear.useMutation({
        onError: (_error, { serverId }) => utils.taskInbox.list.invalidate({ serverId }),
        onMutate: (input) => dropTaskInboxItem(utils, input),
    });
}
