import { hausTrpc } from '../../lib/haus-server.tsx';

export function useProjectWorkerPlace() {
    const utils = hausTrpc.useUtils();
    return hausTrpc.project.setDefaultWorkerPlace.useMutation({
        onSuccess: (_result, input) => {
            void utils.project.list.invalidate({ serverId: input.serverId });
        },
    });
}
