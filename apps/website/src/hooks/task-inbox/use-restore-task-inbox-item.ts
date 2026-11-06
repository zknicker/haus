import { hausTrpc } from '../../lib/haus-server.tsx';

/**
 * The Inbox's Undo. It settles once the list has re-read, so the caller can
 * swap its Undo row for the restored card with no gap between them.
 */
export function useRestoreTaskInboxItem() {
    const utils = hausTrpc.useUtils();
    return hausTrpc.taskInbox.restore.useMutation({
        onSuccess: (_result, { serverId }) => utils.taskInbox.list.invalidate({ serverId }),
    });
}
