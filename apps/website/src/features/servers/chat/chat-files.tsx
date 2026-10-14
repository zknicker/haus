import type { ChatMessage } from '@haus/api';
import { Button, Description, Label, ListBox, Tooltip } from '@heroui/react';
import { PlusSignIcon } from '@hugeicons-pro/core-stroke-rounded';
import { identityMarkRadius } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { useAttachmentDownload } from '../../../hooks/servers/use-attachment-download.ts';
import { useAttachmentImage } from '../../../hooks/servers/use-attachment-image.ts';
import { ArtifactFileIcon } from '../../artifacts/icons/artifact-file-icon.tsx';
import { ChatSidePaneShell } from '../../chats/chat-side-pane-shell.tsx';
import { bandHeightClassName, shellBandIconSize } from '../../shell/section-header.tsx';
import {
    describeAttachment,
    hostedAttachmentItems,
    type MessageAttachmentItem,
} from './attachment-view.ts';

/**
 * Chat-scoped Attachments pane (website): the attachments carried by this chat's
 * loaded messages, listed in the shared side panel. Attachments are
 * message-scoped on the Server, so the chat's set is derived from its
 * transcript. Desktop opens an Attachments workspace tab instead.
 */
export function ChatFilesPanel({
    messages,
    onClose,
    open,
    takeover,
}: {
    messages: ChatFilesMessages;
    onClose: () => void;
    open: boolean;
    takeover: boolean;
}) {
    return (
        <ChatSidePaneShell label="Attachments" open={open} takeover={takeover}>
            {(width) => (
                <div
                    className="flex h-full min-h-0 min-w-0 flex-1 flex-col"
                    style={width ? { width } : undefined}
                >
                    <header
                        className={`flex ${bandHeightClassName} shrink-0 items-center gap-3 px-3`}
                    >
                        <h2 className="min-w-0 flex-1 truncate font-semibold text-sm">
                            Attachments
                        </h2>
                        <Tooltip>
                            <Button
                                aria-label="Close attachments"
                                isIconOnly
                                onPress={onClose}
                                size="sm"
                                variant="ghost"
                            >
                                <Icon
                                    className="rotate-45"
                                    icon={PlusSignIcon}
                                    size={shellBandIconSize}
                                />
                            </Button>
                            <Tooltip.Content>Close attachments</Tooltip.Content>
                        </Tooltip>
                    </header>
                    <ChatFiles messages={messages} />
                </div>
            )}
        </ChatSidePaneShell>
    );
}

/** The chat's Attachments list: the website's Attachments pane body and a desktop Attachments tab's body. */
export function ChatFiles({ messages }: { messages: ChatFilesMessages }) {
    const download = useAttachmentDownload();
    const attachments =
        messages?.flatMap((message) =>
            hostedAttachmentItems(message.attachments, message.serverId)
        ) ?? [];
    const byId = new Map(attachments.map((attachment) => [attachment.id, attachment]));

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1.5 py-2">
            {attachments.length === 0 ? (
                <p className="m-auto text-muted text-sm">No attachments in this chat.</p>
            ) : (
                <ListBox
                    aria-label="Attachments"
                    onAction={(key) => {
                        const attachment = byId.get(String(key));
                        if (attachment?.source.kind === 'hosted') {
                            download.mutate({
                                attachmentId: attachment.id,
                                filename: attachment.filename,
                                serverId: attachment.source.serverId,
                            });
                        }
                    }}
                    selectionMode="none"
                >
                    {attachments.map((attachment) => (
                        <ListBox.Item
                            id={attachment.id}
                            key={attachment.id}
                            textValue={attachment.filename}
                        >
                            <ChatFileThumbnail attachment={attachment} />
                            <div className="flex min-w-0 flex-col">
                                <Label className="truncate">{attachment.filename}</Label>
                                <Description>{describeAttachment(attachment)}</Description>
                            </div>
                        </ListBox.Item>
                    ))}
                </ListBox>
            )}
        </div>
    );
}

type ChatFilesMessages = readonly Pick<ChatMessage, 'attachments' | 'serverId'>[] | undefined;

/** An image's own pixels when they decode; otherwise the file's kind icon. */
function ChatFileThumbnail({ attachment }: { attachment: MessageAttachmentItem }) {
    const isImage = attachment.kind === 'image';
    const { image } = useAttachmentImage(attachment.source, { enabled: isImage });

    return image ? (
        <img
            alt=""
            className="size-8 shrink-0 border border-border object-cover"
            height={32}
            src={image.url}
            // A forced 32px box takes its corner from the box, like an identity mark.
            style={{ borderRadius: identityMarkRadius(32) }}
            width={32}
        />
    ) : (
        <ArtifactFileIcon kind={attachment.kind} size={32} />
    );
}
