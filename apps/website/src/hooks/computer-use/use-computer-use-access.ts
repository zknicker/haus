import type { ComputerUseAccess } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';

export function useSetComputerUseAccess(serverId: string) {
    const utils = hausTrpc.useUtils();
    const input = { serverId };

    return hausTrpc.computer.setComputerUse.useMutation({
        onMutate: async ({ access, computerId }) => {
            await utils.computer.list.cancel(input);
            const previous = utils.computer.list.getData(input);
            utils.computer.list.setData(input, (computers) =>
                computers?.map((computer) =>
                    computer.id === computerId ? withAccess(computer, access) : computer
                )
            );
            return { previous };
        },
        onError: (_error, _variables, context) => {
            if (context?.previous) {
                utils.computer.list.setData(input, context.previous);
            }
            void utils.computer.list.invalidate(input);
        },
    });
}

function withAccess<T extends { computerUseAccess: ComputerUseAccess }>(
    computer: T,
    computerUseAccess: ComputerUseAccess
) {
    return { ...computer, computerUseAccess };
}
