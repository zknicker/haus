import type { AgentThreadContext, AgentThreadContextMessage } from '@haus/api';
import type { AgentInboxItem } from './agent-inbox-item.ts';
import { formatInboxTime, shortInboxId } from './inbox-header-format.ts';

/**
 * The drained items whose thread context this prompt renders: the first per
 * Thread target, so a Thread mentioned twice in one drain is introduced once
 * (Raft renders `thread_join_context` once per thread target per input).
 */
export function renderedThreadContexts(items: AgentInboxItem[]): Map<string, AgentThreadContext> {
    const rendered = new Map<string, AgentThreadContext>();
    const targets = new Set<string>();
    for (const item of items) {
        const context = item.threadContext;
        if (context && !targets.has(context.threadTarget)) {
            targets.add(context.threadTarget);
            rendered.set(item.id, context);
        }
    }
    return rendered;
}

/** Raft's thread-join block in Haus wording; it precedes the mention's envelope. */
export function formatThreadContext(context: AgentThreadContext, homeTimezone: string): string {
    const recent = context.recentMessages.map((message) => quote(message, homeTimezone));
    return [
        '[Haus thread context: you were mentioned in a thread without model-visible context.]',
        `parent: ${context.parentTarget}`,
        `thread: ${context.threadTarget}`,
        `suggested next step: haus message read --target "${context.suggestedReadTarget}"`,
        '',
        'Parent message:',
        quote(context.parentMessage, homeTimezone),
        '',
        `Recent thread context${context.truncated ? ' (truncated)' : ''}:`,
        ...(recent.length > 0 ? recent : ['- (no earlier thread replies)']),
    ].join('\n');
}

/**
 * The quoted messages a rendered block made model-visible. A clipped message
 * was not shown whole, so it is left for a read to attest.
 */
export function threadContextVisibleMessages(context: AgentThreadContext) {
    return [context.parentMessage, ...context.recentMessages]
        .filter((message) => !message.clipped)
        .map((message) => ({ chatId: message.chatId, id: message.id, sequence: message.sequence }));
}

function quote(message: AgentThreadContextMessage, homeTimezone: string): string {
    const sender = message.senderDescription
        ? `@${message.senderHandle} — ${message.senderDescription}`
        : `@${message.senderHandle}`;
    return `- [msg=${shortInboxId(message.id)} seq=${message.sequence} time=${formatInboxTime(message.createdAt, homeTimezone)} type=${message.senderType}] ${sender}: ${message.content}`;
}
