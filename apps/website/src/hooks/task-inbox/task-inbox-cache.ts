import type { hausTrpc } from '../../lib/haus-server.tsx';

type Utils = ReturnType<typeof hausTrpc.useUtils>;

/**
 * Takes one item out of the cached `taskInbox.list` at once, so a card and the
 * badge leave under the press instead of a round trip later. A read already in
 * flight predates the change and would land over it, so it is cancelled first;
 * `taskInbox.onChanged` reconciles, and a refused write invalidates.
 */
export async function dropTaskInboxItem(
    utils: Utils,
    { serverId, taskId }: { serverId: string; taskId: string }
) {
    const key = { serverId };
    await utils.taskInbox.list.cancel(key);
    utils.taskInbox.list.setData(key, (list) =>
        list ? { items: list.items.filter((item) => item.task.id !== taskId) } : list
    );
}
