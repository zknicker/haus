import * as React from 'react';
import { useParams } from 'react-router-dom';
import type { ChatMessageLayout } from '../../../hooks/servers/chat-message-layout.ts';
import type { useAttachmentDownload } from '../../../hooks/servers/use-attachment-download.ts';
import type { TranscriptMessage } from '../../chats/chat-transcript-message.tsx';
import { mayLinkSharedArtifact } from '../../chats/message-shared-artifacts.tsx';
import { appOrigins, collectSharedArtifactLinks } from '../../chats/shared-artifact-link.ts';
import { hostedAttachmentItems } from './attachment-view.ts';
import { MessageAttachments, type MessageSharedArtifacts } from './message-attachments.tsx';
import { renderPendingMessageAttachments } from './pending-messages.tsx';
import type { PendingChatMessage } from './use-pending-messages.ts';

interface MessageLookup {
    messagesById: ReadonlyMap<string, ChatMessageLayout>;
    pendingById: ReadonlyMap<string, PendingChatMessage>;
}

/**
 * The transcript's media renderer: a message's attachments and the library
 * artifacts its text links to, as one strip below it. Null, never an empty
 * strip, when a message carries neither, so a row has no media height it
 * does not use. Pending sends resolve the same way, so confirmation changes
 * nothing on screen.
 */
export function useRenderMessageMedia({
    download,
    lookupRef,
    serverId,
}: {
    download: ReturnType<typeof useAttachmentDownload>;
    lookupRef: { readonly current: MessageLookup };
    serverId: string;
}) {
    const { slug = '' } = useParams();
    const scope = React.useMemo(
        () => (serverId && slug ? { origins: appOrigins(), serverId, slug } : null),
        [serverId, slug]
    );
    const downloadAttachment = download.mutate;
    const downloadPending = download.isPending;

    return React.useCallback(
        (message: TranscriptMessage) => {
            const targets =
                scope && mayLinkSharedArtifact(message.content)
                    ? collectSharedArtifactLinks(message.content, scope)
                    : [];
            const sharedArtifacts: MessageSharedArtifacts | null =
                scope && targets.length > 0 ? { scope, targets } : null;
            const pendingMessage = lookupRef.current.pendingById.get(message.id);
            if (pendingMessage) {
                return renderPendingMessageAttachments(pendingMessage, sharedArtifacts);
            }

            const source = lookupRef.current.messagesById.get(message.id);
            if (!(source?.attachments.length || sharedArtifacts)) {
                return null;
            }
            return (
                <MessageAttachments
                    attachments={
                        source ? hostedAttachmentItems(source.attachments, source.serverId) : []
                    }
                    downloadDisabled={downloadPending}
                    onDownload={(attachment) =>
                        source &&
                        downloadAttachment({
                            attachmentId: attachment.id,
                            filename: attachment.filename,
                            serverId: source.serverId,
                        })
                    }
                    sharedArtifacts={sharedArtifacts}
                />
            );
        },
        [downloadAttachment, downloadPending, lookupRef, scope]
    );
}
