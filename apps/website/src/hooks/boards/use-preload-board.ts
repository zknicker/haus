import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * Warms what a Tasks row opens, with the same freshness as its mounted reads:
 * `board.list` for the Tasks row, and one board's `task.list` for a board row.
 */
export function usePreloadBoard(serverId: string, boardId?: string) {
    const utils = hausTrpc.useUtils();
    return React.useCallback(() => {
        void utils.board.list.prefetch({ serverId }, queryPolicy.syncedSnapshot);
        if (boardId) {
            void utils.task.list.prefetch({ boardId, serverId }, queryPolicy.syncedSnapshot);
        }
    }, [boardId, serverId, utils]);
}
