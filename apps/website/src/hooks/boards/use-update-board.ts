import { hausTrpc } from '../../lib/haus-server.tsx';
import { putBoard } from './board-cache.ts';

export function useUpdateBoard() {
    const utils = hausTrpc.useUtils();
    return hausTrpc.board.update.useMutation({
        onSuccess: ({ board }, { serverId }) => {
            utils.board.list.setData({ serverId }, (boards) => putBoard(boards, board));
        },
    });
}
