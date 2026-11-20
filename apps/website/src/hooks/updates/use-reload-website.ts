import { toast } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { hasArtifactTextDrafts } from '../../features/artifacts/artifact-text-drafts.ts';
import { hasChatDrafts } from '../../features/servers/chat/chat-draft-store.ts';
import { hasPaneEditorDrafts } from '../pane/pane-editor-drafts.ts';

export function useReloadWebsite() {
    const queryClient = useQueryClient();
    return () => {
        if (
            hasChatDrafts() ||
            hasPaneEditorDrafts() ||
            hasArtifactTextDrafts() ||
            queryClient.isMutating() > 0
        ) {
            toast.warning('Finish your changes before reloading', {
                description:
                    'Send or clear chat drafts, save editor changes, and wait for pending saves to finish.',
            });
            return;
        }
        window.location.reload();
    };
}
