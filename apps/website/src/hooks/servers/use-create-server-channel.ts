import { hausTrpc } from '../../lib/haus-server.tsx';

/** A person creates a Project: its channel, key, and `projects` row. */
export function useCreateServerChannel() {
    const utils = hausTrpc.useUtils();

    return hausTrpc.project.create.useMutation({
        // The chat.lifecycle `created` event owns list invalidation; this is
        // the creator's un-awaited ack fallback so navigation never waits.
        onSuccess: ({ chat }) => {
            void utils.chat.list.invalidate({ serverId: chat.serverId });
        },
    });
}
