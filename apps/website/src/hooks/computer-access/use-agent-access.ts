import { hausTrpc } from '../../lib/haus-server.tsx';

/** `computer.grantAgentAccess`; `computer.updated` brings the grant into the list. */
export function useGrantAgentAccess(serverId: string) {
    const utils = hausTrpc.useUtils();
    const input = { serverId };

    return hausTrpc.computer.grantAgentAccess.useMutation({
        onSettled: () => utils.computer.list.invalidate(input),
    });
}

/** `computer.revokeAgentAccess`; the grant and its named computer use entry leave the list at once. */
export function useRevokeAgentAccess(serverId: string) {
    const utils = hausTrpc.useUtils();
    const input = { serverId };

    return hausTrpc.computer.revokeAgentAccess.useMutation({
        onMutate: async ({ agentId, computerId }) => {
            await utils.computer.list.cancel(input);
            const previous = utils.computer.list.getData(input);
            utils.computer.list.setData(input, (computers) =>
                computers?.map((computer) =>
                    computer.id === computerId
                        ? {
                              ...computer,
                              agentAccessGrants: computer.agentAccessGrants.filter(
                                  (grant) => grant.agentId !== agentId
                              ),
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
            void utils.computer.list.invalidate(input);
        },
    });
}
