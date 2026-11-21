import { hausTrpc } from '../../lib/haus-server.tsx';

export function useSetComputerUseEnabled(serverId: string) {
    const utils = hausTrpc.useUtils();
    const input = { serverId };

    return hausTrpc.computer.setComputerUse.useMutation({
        onMutate: async ({ computerId, enabled }) => {
            await utils.computer.list.cancel(input);
            const previous = utils.computer.list.getData(input);
            utils.computer.list.setData(input, (computers) =>
                computers?.map((computer) =>
                    computer.id === computerId
                        ? { ...computer, computerUseEnabled: enabled }
                        : computer
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
