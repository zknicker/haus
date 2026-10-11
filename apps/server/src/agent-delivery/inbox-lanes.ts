/**
 * Which inbox items ride the concrete lane. A concrete item's envelope is
 * composed into the run's own first prompt and is served the moment the
 * Computer accepts that run; everything else rides the notice lane, where the
 * Agent decides whether to pull the body. Fires and task assignments are
 * concrete because they exist nowhere but the inbox: a discretionary pull is
 * the only thing standing between the wake and its reason, and an unread one
 * leaves an answer with no provable cause (specs/inbox.md). A Trigger problem
 * notice is concrete for the same reason (specs/github-triggers.md#failure-modes).
 */
export const concreteInboxSources = [
    'onboarding',
    'cloud_agent_work',
    'trigger',
    'trigger_problem',
    'reminder',
    'task_assignment',
] as const;

export function isConcreteInboxSource(source: string): boolean {
    return (concreteInboxSources as readonly string[]).includes(source);
}

/**
 * Typed attentions that exist nowhere but their inbox row. They carry no Chat
 * message, so a message pull can never return their bodies and the message
 * lanes exclude them by source.
 */
export const bodilessInboxSources = ['onboarding', 'cloud_agent_work', 'trigger_problem'] as const;
