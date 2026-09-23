import type { AgentInboxAsk } from './agent-inbox-item.ts';

/**
 * One owner of Ask presentation. The delivery envelope, the drain envelope, and
 * the busy notice read the same status and addressee; only the grammar differs.
 */
export function formatAskSuffix(ask: AgentInboxAsk): string {
    return ` [ask status=${ask.status}${askAddressee(ask)}]`;
}

/** The notice tag: content-free, and shaped like the `task #N` tag beside it. */
export function formatAskTag(ask: AgentInboxAsk): string {
    return `ask ${ask.status}${askAddressee(ask)}`;
}

/** The drain marker: compressed like the `task=#N:status:assignee` marker beside it. */
export function formatAskMarker(ask: AgentInboxAsk): string {
    const handle = askHandle(ask);
    return ` ask=${ask.status}${handle ? `:${handle}` : ''}`;
}

function askAddressee(ask: AgentInboxAsk): string {
    const handle = askHandle(ask);
    return handle ? ` to=${handle}` : '';
}

function askHandle(ask: AgentInboxAsk): string | null {
    return ask.addresseeHandle ? `@${ask.addresseeHandle}` : null;
}
