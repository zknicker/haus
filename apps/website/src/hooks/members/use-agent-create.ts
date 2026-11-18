import type { CreateAgentInput } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';

export function useAgentCreate(serverId: string) {
    const utils = hausTrpc.useUtils();
    const mutation = hausTrpc.agent.create.useMutation();

    return {
        ...mutation,
        createAgent: async (input: CreateAgentInput) => {
            const result = await mutation.mutateAsync(input);
            await Promise.all([
                utils.agent.list.invalidate({ serverId }),
                utils.chat.list.invalidate({ serverId }),
            ]);
            return result;
        },
    };
}
