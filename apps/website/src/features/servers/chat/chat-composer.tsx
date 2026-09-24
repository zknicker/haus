import type { Agent } from '@haus/api';
import { PromptInput } from '@heroui-pro/react';
import { Attachment01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useChatComposerFocusRequest } from '../../../commands/chat-composer-focus.ts';
import {
    appendComposerInsert,
    useChatComposerInsertRequest,
} from '../../../commands/chat-composer-insert.ts';
import { useChatComposerMentionRequest } from '../../../commands/chat-composer-mention.ts';
import { Icon } from '../../../components/ui/icon.tsx';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useChatMessageSend } from '../../../hooks/servers/use-chat-message-send.ts';
import { useUploadServerAttachment } from '../../../hooks/servers/use-upload-server-attachment.ts';
import { buildAgentMentionOption } from '../../mentions/mention-options.ts';
import {
    MentionComposerEditor,
    MentionComposerPicker,
    useServerMentionComposer,
} from '../../mentions/use-mention-composer.tsx';
import {
    hasChatComposerPayload,
    resolveChatComposerPlaceholder,
} from './chat-composer-presentation.ts';
import { ChatComposerRecovery } from './chat-composer-recovery.tsx';
import { discardFailedChatDraft, restoreFailedChatDraft } from './chat-draft-store.ts';
import { ChatInlineReplyReference, type ChatInlineReplyTarget } from './chat-inline-reply.tsx';
import { ComposerAttachments } from './composer-attachments.tsx';
import { submitChatComposer } from './submit-chat-composer.ts';
import { useChatDraft } from './use-chat-draft.ts';
import { useCompactComposerLayout } from './use-compact-composer-layout.ts';

const emptyAgents: Agent[] = [];

export function ServerChatComposer({
    chatId,
    chatName,
    draftKey,
    inlineReply,
    onMaterialized,
    onInlineReplyCancel,
    onInlineReplySent,
    onThreadCreated,
    pendingChatId,
    placeholder,
    serverId,
    status,
    thread,
    target,
    variant = 'primary',
}: {
    chatId?: string;
    chatName: string;
    draftKey: string;
    inlineReply?: ChatInlineReplyTarget | null;
    onMaterialized?: (chatId: string) => void;
    onInlineReplyCancel?: () => void;
    onInlineReplySent?: (messageId: string) => void;
    onThreadCreated?: (threadChatId: string) => void;
    /**
     * The transcript that shows this composer's sends while they are in flight.
     * A chat renders its own id; a Thread renders an anchor-owned key, because
     * a first reply has no Thread chat id until its receipt returns.
     */
    pendingChatId?: string;
    placeholder?: string;
    serverId: string;
    /** The typing row; the composer reserves its height above the shell. */
    status?: React.ReactNode;
    thread?: { anchorMessageId: string };
    target: { agentId: string; kind: 'agent-dm' } | { chatId: string; kind: 'chat' };
    /**
     * The shell's surface styling. The primary shell is tinted for the page
     * background; on a surface (a modal dialog) it would match its host
     * exactly, so those callers pass `secondary`.
     */
    variant?: 'primary' | 'secondary';
}) {
    const agents = useAgents(serverId);
    const agentList = agents.data ?? emptyAgents;
    const {
        addAttachments,
        attachmentError,
        attachmentInput,
        attachments,
        clearAttachmentError,
        content: draft,
        failed: failedDrafts,
        mentions,
        removeAttachment,
        updateContent,
        updateMentions,
    } = useChatDraft(draftKey);
    const { editorSlotRef, isExpanded } = useCompactComposerLayout({
        content: draft,
        isForcedExpanded: attachments.length > 0,
    });
    const mentionableAgentIds = React.useMemo(
        () => agentList.map((agent) => agent.id),
        [agentList]
    );
    const mentionComposer = useServerMentionComposer({
        agents: agentList,
        chatTarget: target,
        content: draft,
        initialMentions: mentions,
        mentionableAgentIds,
        onMentionsChange: updateMentions,
        onSubmit: () => {
            void handleSubmit();
        },
        onTextChange: updateContent,
        serverId,
    });

    const send = useChatMessageSend();
    const upload = useUploadServerAttachment();
    const activeInlineReply = thread ? null : inlineReply;

    useChatComposerFocusRequest(!thread, mentionComposer.focusTextEditor);
    useChatComposerInsertRequest(!thread, (text) => {
        updateContent((current) => appendComposerInsert(current, text));
        requestAnimationFrame(mentionComposer.focusTextEditor);
    });
    useChatComposerMentionRequest(thread ? null : (chatId ?? null), ({ agentId }) => {
        const agent = agentList.find((candidate) => candidate.id === agentId);
        if (!agent) {
            return;
        }
        mentionComposer.handleMentionSelect(
            buildAgentMentionOption({
                agentId,
                agents: [{ id: agent.id, name: agent.displayName }],
            })
        );
    });

    // Sending is optimistic: the draft leaves the editor immediately and the
    // transcript's pending row carries it, so nothing here waits on a round
    // trip. A failed send becomes a recoverable draft without replacing newer work.
    function handleSubmit(event?: React.FormEvent) {
        return submitChatComposer({
            attachmentInput,
            chatId,
            clearAttachmentError,
            draftKey,
            event,
            focusTextEditor: mentionComposer.focusTextEditor,
            inlineReply: activeInlineReply,
            onMaterialized,
            onInlineReplySent,
            onThreadCreated,
            pendingChatId,
            send,
            serverId,
            target,
            thread,
            upload,
        });
    }

    const errorMessage = attachmentError ?? upload.error?.message ?? send.error?.message;
    const hasPayload = hasChatComposerPayload({
        attachmentCount: attachments.length,
        content: draft,
    });
    const canSubmit = hasPayload;

    return (
        <div className="shrink-0 px-5 pb-4">
            <ChatComposerRecovery
                drafts={failedDrafts}
                onDiscard={(id) => discardFailedChatDraft(draftKey, id)}
                onRestore={(id) => {
                    restoreFailedChatDraft(draftKey, id);
                    requestAnimationFrame(mentionComposer.focusTextEditor);
                }}
            />
            {status ? <div aria-hidden="true" className="h-6 shrink-0" /> : null}
            <PromptInput
                data-expanded={isExpanded || undefined}
                data-replying={Boolean(activeInlineReply) || undefined}
                layout="compact"
                onSubmit={() => {
                    void handleSubmit();
                }}
                value={draft}
                variant={variant}
            >
                {/* One stack grows up from the shell over the transcript's
                    clearance: the reply bar joins the editor, and typing
                    rides above it, so neither covers the other. */}
                <div
                    className="absolute inset-x-0 bottom-full flex flex-col"
                    data-slot="chat-composer-stack"
                >
                    {status}
                    <ChatInlineReplyReference
                        onCancel={onInlineReplyCancel ?? (() => undefined)}
                        target={activeInlineReply ?? null}
                    />
                </div>
                <PromptInput.Shell onMouseDown={handleShellMouseDown}>
                    <PromptInput.Content>
                        <ComposerAttachments
                            attachments={attachments}
                            onRemove={(nonce) => {
                                removeAttachment(nonce);
                                mentionComposer.focusTextEditor();
                            }}
                        />
                        {/* The mention editor occupies PromptInput's textarea
                            slot so compact and expanded layouts stay stock. */}
                        <div
                            className="chat-composer-editor prompt-input__textarea"
                            ref={editorSlotRef}
                        >
                            <MentionComposerEditor
                                ariaLabel={`Message ${chatName}`}
                                autoFocus={!thread}
                                composer={mentionComposer}
                                key={draftKey}
                                mentions={mentions}
                                name="chat-message"
                                placeholder={resolveChatComposerPlaceholder(chatName, placeholder)}
                            />
                        </div>
                    </PromptInput.Content>
                    <PromptInput.Toolbar>
                        <PromptInput.ToolbarStart>
                            {target.kind === 'chat' ? (
                                <input
                                    className="sr-only"
                                    multiple
                                    onChange={(event) => {
                                        const files = Array.from(event.target.files ?? []);
                                        addAttachments(files);
                                    }}
                                    ref={attachmentInput}
                                    type="file"
                                />
                            ) : null}
                            {target.kind === 'chat' ? (
                                <PromptInput.Action
                                    aria-label="Add attachments"
                                    onPress={() => attachmentInput.current?.click()}
                                    tooltip="Add attachments"
                                >
                                    <Icon className="size-4" icon={Attachment01Icon} />
                                </PromptInput.Action>
                            ) : null}
                        </PromptInput.ToolbarStart>
                        <PromptInput.ToolbarEnd>
                            <PromptInput.Send aria-label="Send" isDisabled={!canSubmit} />
                        </PromptInput.ToolbarEnd>
                    </PromptInput.Toolbar>
                </PromptInput.Shell>
                {/* The picker opens above the composer, so it sits outside the
                    shell, which clips its overflow. */}
                <MentionComposerPicker composer={mentionComposer} />
            </PromptInput>
            {errorMessage ? <p className="mt-2 text-danger text-sm">{errorMessage}</p> : null}
        </div>
    );

    // Clicking inert composer space focuses the editor, which the shell cannot
    // do itself because the mention editor replaces its textarea.
    function handleShellMouseDown(event: React.MouseEvent<HTMLDivElement>) {
        const target = event.target as HTMLElement;

        if (
            target.closest(
                'button, a, input, select, textarea, [contenteditable], [role="button"], [role="switch"]'
            )
        ) {
            return;
        }

        event.preventDefault();
        mentionComposer.focusTextEditor();
    }
}
