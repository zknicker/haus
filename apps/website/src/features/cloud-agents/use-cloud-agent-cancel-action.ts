import type { CloudAgentWork } from '@haus/api';
import { toast } from '@heroui/react';
import { useParams } from 'react-router-dom';
import { useCloudAgentWorkCancel } from '../../hooks/servers/use-cloud-agent-work.ts';
import { useServer } from '../../hooks/servers/use-server.ts';
import { canCancelCloudAgentWork } from './cloud-agent-presentation.ts';

/**
 * The one cancel path, pressed from the work card's control band wherever the
 * card renders — the Chat transcript and the Thread alike. Server records the
 * request and the Run settles through the ordinary observation path, so
 * nothing here writes cache — the work reads as cancelling until
 * `cloud-agent-work.updated` arrives.
 */
export function useCloudAgentCancelAction(work: CloudAgentWork) {
    const { slug = '' } = useParams();
    const { data: server } = useServer(slug, Boolean(slug));
    const cancel = useCloudAgentWorkCancel();

    return {
        canCancel:
            server !== undefined &&
            canCancelCloudAgentWork({
                cancelRequestedAt: work.cancelRequestedAt,
                role: server.role,
                status: work.status,
            }),
        isPending: cancel.isPending,
        requestCancel: () => {
            if (!server) {
                return;
            }
            cancel
                .mutateAsync({ serverId: server.id, workId: work.id })
                .then(() => toast.success('Cancel requested'))
                .catch((error: unknown) =>
                    toast.danger('Could not cancel this work', {
                        description: error instanceof Error ? error.message : 'Try again.',
                    })
                );
        },
    };
}
