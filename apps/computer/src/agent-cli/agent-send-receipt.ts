import { type HausAgentSendResponse, TASK_TARGET_PATTERN } from '@haus/api';

import type { AgentCliMessage } from './agent-api-schemas.ts';
import { formatDeliveryEnvelope, shortMessageId } from './agent-format.ts';
import { renderFailedImageGenerations } from './image-render.ts';

type SentResponse = Extract<HausAgentSendResponse, { state: 'sent' }>;

/** What the send command knows beyond the response: flags it actually sent. */
export interface SendReceiptOptions {
    /** `--done` reached the Server; false when an older Server forced a plain resend. */
    done?: boolean;
    /** The `--reply-to` value, used only when the response carries no reply reference. */
    replyToMessageId?: string;
}

export function renderSentReceipt(
    target: string,
    { failedImageGenerations, message, recentUnread }: SentResponse,
    options: SendReceiptOptions
): string {
    const lines = [
        `Message sent to ${target}. Message ID: ${message.id}`,
        sendPlacement(target, message, options),
        ...renderFailedImageGenerations(failedImageGenerations ?? []),
    ];
    if (recentUnread.length > 0) {
        lines.push(
            '',
            '--- New messages you may have missed ---',
            ...recentUnread.map((row) => formatDeliveryEnvelope(row.target, row.message))
        );
    }
    return `${lines.join('\n')}\n`;
}

/**
 * One consequence line for a sent message: where it landed and who is notified.
 * It states facts the target and response carry, never a suggested next address.
 * Notification claims follow `messageNotificationReason` in `@haus/api`.
 */
export function sendPlacement(
    target: string,
    message: AgentCliMessage,
    options: SendReceiptOptions
): string {
    if (TASK_TARGET_PATTERN.test(target)) {
        const placement = `Posted in ${target}; the Task's followers see it as unread, and anyone you @mentioned is notified.`;
        return options.done ? `${placement} This closes your reply in this Task.` : placement;
    }
    const placement = placementSentence(target, message, options);
    return options.done ? `${placement} This closes your reply to that request.` : placement;
}

function placementSentence(
    chat: string,
    message: AgentCliMessage,
    options: SendReceiptOptions
): string {
    const kind = chat.startsWith('dm:') ? 'DM' : 'channel';
    const peer = chat.slice('dm:'.length);
    const replyTo = message.reply?.parentMessageId ?? options.replyToMessageId;
    if (replyTo) {
        const parentId = shortMessageId(replyTo);
        // Only a human author is notified; without the response reference the author is unknown.
        return message.reply?.parent.author.kind === 'human'
            ? `Posted in ${chat} as an inline reply to message ${parentId}; its author is notified.`
            : `Posted in ${chat} as an inline reply, quoted under message ${parentId}.`;
    }
    const audience = kind === 'DM' ? peer : 'members';
    const verb = kind === 'DM' ? 'sees' : 'see';
    return `Posted at the top of ${chat}; ${audience} ${verb} it in the ${kind}.`;
}
