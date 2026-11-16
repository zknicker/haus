import { hausTrpc } from '../../lib/haus-server.tsx';
import { putBoard } from './board-cache.ts';

export function useCreateBoard() {
    const utils = hausTrpc.useUtils();
    return hausTrpc.board.create.useMutation({
        onSuccess: ({ board }, { serverId }) => {
            utils.board.list.setData({ serverId }, (boards) => putBoard(boards, board));
        },
    });
}
