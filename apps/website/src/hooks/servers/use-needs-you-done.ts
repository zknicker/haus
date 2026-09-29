import type { NeedsYouRow } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';

/**
 * Marks one Needs you row Done through its newest addressing message.
 *
 * The row leaves the list at once and the Server's answer reconciles it: the
 * reader-scoped `chat.read` event that Done emits refetches the list, and so
 * does this mutation's own settle, which repairs a client whose stream is
 * reconnecting. A failure puts the previous list back.
 */
export function useNeedsYouDone() {
    const utils = hausTrpc.useUtils();

    return hausTrpc.inbox.markDone.useMutation({
        onMutate: async (input) => {
            const key = { serverId: input.serverId };
            await utils.inbox.needsYou.cancel(key);
            const previous = utils.inbox.needsYou.getData(key);
            utils.inbox.needsYou.setData(key, (rows) =>
                rows ? withoutDoneRow(rows, input) : rows
            );
            return { previous };
        },
        onError: (_error, input, context) => {
            if (context) {
                utils.inbox.needsYou.setData({ serverId: input.serverId }, context.previous);
            }
        },
        onSettled: (_result, _error, input) => {
            void utils.inbox.needsYou.invalidate({ serverId: input.serverId });
        },
    });
}

/**
 * The list with a Done applied. A row whose newest addressing is past the
 * covered sequence stays: newer activity is exactly what brings a row back.
 */
export function withoutDoneRow<Row extends Pick<NeedsYouRow, 'chatId' | 'latest'>>(
    rows: readonly Row[],
    done: { chatId: string; throughSequence: number }
): Row[] {
    return rows.filter(
        (row) => row.chatId !== done.chatId || row.latest.sequence > done.throughSequence
    );
}
