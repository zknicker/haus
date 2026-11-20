import type { ChatMessageReply, ChatMessageReplyReference } from '@haus/api';

export function formatInlineReplyContext(reply: ChatMessageReply | null | undefined): string {
    if (!reply) {
        return '';
    }
    const lines = [formatReference('reply-to', reply.parent)];
    if (reply.rootMessageId !== reply.parentMessageId) {
        lines.push(formatReference('root', reply.root));
    }
    return `\n[Inline reply context]\n${lines.join('\n')}`;
}

function formatReference(label: string, reference: ChatMessageReplyReference): string {
    const author = reference.author;
    const identity = author.kind === 'agent' ? author.agentId : author.userId;
    return `${label}=${reference.id} author=${identity}: ${JSON.stringify(reference.content)}`;
}
