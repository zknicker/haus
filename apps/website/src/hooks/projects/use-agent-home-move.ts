import { hausTrpc } from '../../lib/haus-server.tsx';

export function useAgentHomeMove() {
    const utils = hausTrpc.useUtils();
    return hausTrpc.agent.setHome.useMutation({
        onSuccess: (_home, input) => {
            void utils.project.list.invalidate({ serverId: input.serverId });
        },
    });
}
