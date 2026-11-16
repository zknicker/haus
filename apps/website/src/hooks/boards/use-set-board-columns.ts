import { hausTrpc } from '../../lib/haus-server.tsx';
import { putBoard } from './board-cache.ts';

export function useSetBoardColumns() {
    const utils = hausTrpc.useUtils();
    return hausTrpc.board.setColumns.useMutation({
        onSuccess: ({ board }, { serverId }) => {
            utils.board.list.setData({ serverId }, (boards) => putBoard(boards, board));
        },
    });
}
