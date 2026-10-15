import type { HausAgentSendResponse } from '@haus/api';
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
        ...ownThreadLine(target, message),
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
    const parsed = parseTarget(target);
    const placement = placementSentence(parsed, message, options);
    if (!options.done) {
        return placement;
    }
    const closing = parsed.anchor
        ? 'This closes your reply in this thread.'
        : 'This closes your reply to that request.';
    return `${placement} ${closing}`;
}

/**
 * The sent message's own thread target, stated as a fact so the Agent knows an
 * address besides the request's. Thread sends get none: threads cannot nest.
 */
export function ownThreadLine(target: string, message: AgentCliMessage): string[] {
    const { anchor, chat } = parseTarget(target);
    return anchor ? [] : [`Thread on this message: ${chat}:${shortMessageId(message.id)}`];
}

function placementSentence(
    { anchor, chat, kind }: ParsedTarget,
    message: AgentCliMessage,
    options: SendReceiptOptions
): string {
    const peer = chat.slice('dm:'.length);
    if (anchor && kind === 'DM') {
        return `Posted in the thread on message ${anchor} in ${chat}; ${peer} is notified, as for every DM message.`;
    }
    if (anchor) {
        return `Posted in the thread on message ${anchor} in ${chat}. The channel shows it as a one-line preview; followers see it as unread, and only that message's author and anyone you @mentioned are notified.`;
    }
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

interface ParsedTarget {
    anchor: string | null;
    chat: string;
    kind: 'channel' | 'DM';
}

function parseTarget(target: string): ParsedTarget {
    const kind = target.startsWith('dm:') ? 'DM' : 'channel';
    const anchorAt = target.indexOf(':', kind === 'DM' ? 'dm:'.length : 0);
    return anchorAt < 0
        ? { anchor: null, chat: target, kind }
        : { anchor: target.slice(anchorAt + 1), chat: target.slice(0, anchorAt), kind };
}
