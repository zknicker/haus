import { hausTrpc } from '../../lib/haus-server.tsx';

export function useSetAgentAccessScope(serverId: string) {
    const utils = hausTrpc.useUtils();
    const input = { serverId };

    return hausTrpc.computer.setAgentAccessScope.useMutation({
        onMutate: async ({ computerId, scope }) => {
            await utils.computer.list.cancel(input);
            const previous = utils.computer.list.getData(input);
            utils.computer.list.setData(input, (computers) =>
                computers?.map((computer) =>
                    computer.id === computerId ? { ...computer, agentAccessScope: scope } : computer
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
