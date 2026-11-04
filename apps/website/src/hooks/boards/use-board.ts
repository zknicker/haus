import type { Board } from '@haus/api';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * One board by key, selected from the one `board.list` read. Undefined until
 * that read settles; null when it settled without the key: an archived board,
 * an old key, or a mistyped address.
 */
export function useBoard(serverId: string | undefined, boardKey: string): Board | null | undefined {
    const select = React.useCallback(
        (boards: Board[]) => boards.find((board) => board.key === boardKey) ?? null,
        [boardKey]
    );
    const { data } = hausTrpc.board.list.useQuery(
        { serverId: serverId ?? '' },
        { ...queryPolicy.syncedSnapshot, enabled: serverId !== undefined, select }
    );
    return data;
}
