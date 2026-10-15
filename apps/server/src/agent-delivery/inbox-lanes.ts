/**
 * Which inbox items ride the concrete lane. A concrete item's envelope is
 * composed into the run's own first prompt and is served the moment the
 * Computer accepts that run; everything else rides the notice lane, where the
 * Agent decides whether to pull the body. Fires and task assignments are
 * concrete because they exist nowhere but the inbox: a discretionary pull is
 * the only thing standing between the wake and its reason, and an unread one
 * leaves an answer with no provable cause (specs/inbox.md). A Trigger problem
 * notice is concrete for the same reason (specs/github-triggers.md#failure-modes),
 * and so is a Linear session event (specs/linear-app.md#inbox-sources).
 */
export const concreteInboxSources = [
    'onboarding',
    'cloud_agent_work',
    'trigger',
    'trigger_problem',
    'image_generation_failed',
    'reminder',
    'task_assignment',
    'dream',
    'linear_session',
    'linear_session_automated',
] as const;

export function isConcreteInboxSource(source: string): boolean {
    return (concreteInboxSources as readonly string[]).includes(source);
}

/**
 * Typed attentions that exist nowhere but their inbox row. They carry no Chat
 * message, so a message pull can never return their bodies and the message
 * lanes exclude them by source.
 */
export const bodilessInboxSources = [
    'onboarding',
    'cloud_agent_work',
    'trigger_problem',
    'image_generation_failed',
    'dream',
    'linear_session',
    'linear_session_automated',
] as const;

/**
 * Concrete attentions no busy notice, unread digest, or `haus inbox check` lists,
 * because each leads its own run: Cove's bootstrap, and a `dream`, which has no
 * Chat to list it under.
 */
export const noticelessInboxSources = ['onboarding', 'dream'] as const;

export function isNoticelessInboxSource(source: string): boolean {
    return (noticelessInboxSources as readonly string[]).includes(source);
}

/** The Chat of a row its lane already proved Chat-backed; a chatless row there is a bug. */
export function chatOf(row: { chatId: string | null; dedupeKey: string }): string {
    if (row.chatId === null) {
        throw new Error(`Inbox item ${row.dedupeKey} has no Chat.`);
    }
    return row.chatId;
}
