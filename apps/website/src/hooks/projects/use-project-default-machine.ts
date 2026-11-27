import { hausTrpc } from '../../lib/haus-server.tsx';

export function useProjectDefaultMachine() {
    const utils = hausTrpc.useUtils();
    return hausTrpc.project.setDefaultMachine.useMutation({
        onSuccess: (_result, input) => {
            void utils.project.list.invalidate({ serverId: input.serverId });
        },
    });
}
