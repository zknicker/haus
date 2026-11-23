import { hausTrpc } from '../../lib/haus-server.tsx';

export function useSetComputerWorkers(serverId: string) {
    const utils = hausTrpc.useUtils();
    const input = { serverId };

    return hausTrpc.computer.setWorkers.useMutation({
        onMutate: async ({ computerId, enabled, limit }) => {
            await utils.computer.list.cancel(input);
            const previous = utils.computer.list.getData(input);
            utils.computer.list.setData(input, (computers) =>
                computers?.map((computer) =>
                    computer.id === computerId
                        ? {
                              ...computer,
                              workerLimit: limit ?? computer.workerLimit,
                              workersEnabled: enabled,
                          }
                        : computer
                )
            );
            return { previous };
        },
        onError: (_error, _variables, context) => {
            if (context?.previous) {
                utils.computer.list.setData(input, context.previous);
            }
        },
        onSettled: () => utils.computer.list.invalidate(input),
    });
}
