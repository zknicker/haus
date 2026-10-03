import type { ChatMessage } from '@haus/api';
import { Button, Tooltip } from '@heroui/react';
import { Attachment01Icon, PlusSignIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import { ChatSidePaneShell } from '../../chats/chat-side-pane-shell.tsx';
import { bandHeightClassName, shellBandIconSize } from '../../shell/section-header.tsx';

/**
 * Chat-scoped Files pane (website): the attachments carried by this chat's
 * loaded messages, listed in the shared side panel. Attachments are
 * message-scoped on the Server, so the chat's set is derived from its
 * transcript. Desktop opens a Files workspace tab instead.
 */
export function ChatFilesPanel({
    messages,
    onClose,
    open,
    takeover,
}: {
    messages: ChatMessage[] | undefined;
    onClose: () => void;
    open: boolean;
    takeover: boolean;
}) {
    return (
        <ChatSidePaneShell label="Files" open={open} takeover={takeover}>
            {(width) => (
                <div
                    className="flex h-full min-h-0 min-w-0 flex-1 flex-col"
                    style={width ? { width } : undefined}
                >
                    <header
                        className={`flex ${bandHeightClassName} shrink-0 items-center gap-3 px-3`}
                    >
                        <h2 className="min-w-0 flex-1 truncate font-semibold text-sm">Files</h2>
                        <Tooltip>
                            <Button
                                aria-label="Close files"
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
                            <Tooltip.Content>Close files</Tooltip.Content>
                        </Tooltip>
                    </header>
                    <ChatFiles messages={messages} />
                </div>
            )}
        </ChatSidePaneShell>
    );
}

/** The chat's Files list: the website's Files pane body and a desktop Files tab's body. */
export function ChatFiles({ messages }: { messages: ChatMessage[] | undefined }) {
    const attachments = messages?.flatMap((message) => message.attachments) ?? [];
    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-2">
            {attachments.length === 0 ? (
                <p className="m-auto text-muted text-sm">No files in this chat.</p>
            ) : (
                attachments.map((attachment) => (
                    <div
                        className="flex items-center gap-3 border-border border-b py-3"
                        key={attachment.id}
                    >
                        <Icon className="size-4 text-muted" icon={Attachment01Icon} />
                        <span className="min-w-0 truncate text-sm">{attachment.filename}</span>
                    </div>
                ))
            )}
        </div>
    );
}
