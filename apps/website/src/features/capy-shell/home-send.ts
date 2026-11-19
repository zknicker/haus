import { formatAgentReferenceTarget } from '@haus/api/rich-references';
import type { useChatMessageSend } from '../../hooks/servers/use-chat-message-send.ts';
import { buildChatComposerSubmission } from '../chats/chat-composer-submission.ts';
import {
    chatDraftKey,
    type ChatDraftContents,
    recoverFailedChatDraft,
} from '../servers/chat/chat-draft-store.ts';
import {
    addPendingChatMessage,
    dropPendingChatMessage,
    settlePendingChatMessage,
} from '../servers/chat/use-pending-messages.ts';

export interface HomeSendPaths {
    live: 'channel-mention';
    next: 'create-task';
}

export interface HomeAsk {
    captain: { agentId: string; name: string };
    projectChatId: string;
    text: string;
}

export interface ChannelMentionSend {
    chatId: string;
    content: string;
    draft: ChatDraftContents;
    path: HomeSendPaths['live'];
}

export function planHomeSend(ask: HomeAsk) {
    const text = ask.text.trim();
    if (text.length === 0) {
        return null;
    }
    const handle = `@${ask.captain.name}`;
    const draft: ChatDraftContents = {
        attachments: [],
        content: `${handle} ${text}`,
        mentions: [
            {
                end: handle.length,
                id: formatAgentReferenceTarget(ask.captain.agentId),
                kind: 'agent',
                label: ask.captain.name,
                projection: 'agent-reference',
                start: 0,
                text: handle,
            },
        ],
    };
    return {
        chatId: ask.projectChatId,
        content: buildChatComposerSubmission(draft).content,
        draft,
        path: 'channel-mention',
    } satisfies ChannelMentionSend;
}

export function defaultCaptainId(
    projectCaptainIds: readonly string[],
    captainIds: readonly string[]
) {
    return projectCaptainIds.find((id) => captainIds.includes(id)) ?? captainIds[0] ?? null;
}

export async function sendHomeAsk({
    plan,
    send,
    serverId,
}: {
    plan: ChannelMentionSend;
    send: Pick<ReturnType<typeof useChatMessageSend>, 'mutateAsync'>;
    serverId: string;
}) {
    const nonce = crypto.randomUUID();
    addPendingChatMessage(plan.chatId, {
        attachments: [],
        content: plan.content,
        nonce,
        reply: null,
    });
    try {
        const receipt = await send.mutateAsync({
            attachmentIds: [],
            chatId: plan.chatId,
            content: plan.content,
            nonce,
            serverId,
        });
        settlePendingChatMessage({
            chatId: plan.chatId,
            createdAt: receipt.message.createdAt,
            messageId: receipt.message.id,
            nonce,
        });
    } catch {
        dropPendingChatMessage(plan.chatId, nonce);
        recoverFailedChatDraft(chatDraftKey(serverId, plan.chatId), plan.draft);
    }
}
