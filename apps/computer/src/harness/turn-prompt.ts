import type { UnreadElsewhere } from '../agent-commands.ts';
import type { AgentInboxItem } from '../agent-inbox-item.ts';
import { composeInboxDrain, composeInboxNotice, formatUnreadElsewhere } from '../inbox-format.ts';
import { consumeVisibleMessages, recordRunVisibleMessages } from '../inbox-store.ts';
import { renderedThreadContexts, threadContextVisibleMessages } from '../thread-context-format.ts';

/** What the frame offers this turn, independent of how the turn was started. */
export interface TurnDelivery {
    agentId: string;
    dataRoot: string;
    drainItemIds: string[];
    homeTimezone: string;
    inbox: AgentInboxItem[];
    inboxDelivery: 'concrete' | 'notice';
    runId: string;
    serverId: string;
    totalPending: number;
    unreadElsewhere: UnreadElsewhere[];
    warmDrainItemIds: string[];
}

const resetContextLine =
    'Fresh session: your previous conversation context is gone. Your workspace and MEMORY.md are intact — MEMORY.md is your recovery point.';

export interface TurnPrompt {
    /** Exactly the identities whose bodies this prompt puts in front of the model. */
    drained: AgentInboxItem[];
    /** The content-free notice already in the prompt, so no sink repeats it. */
    notice: string | null;
    turnContent: string;
}

/**
 * Composes one turn's input. The Server says which items may be drained; the
 * lane is decided here, because only the Computer knows whether the harness
 * session resumed. An alive session drains every eligible item, matching Raft's
 * alive-idle wake; a cold start drains only the items addressed to this Agent
 * and notices the rest, which is Raft's hybrid shape (specs/inbox.md).
 */
export function composeTurnPrompt(
    input: TurnDelivery,
    session: { isColdStart: boolean; sessionGeneration: number }
): TurnPrompt {
    const drainable = new Set(
        session.isColdStart
            ? input.drainItemIds
            : [...input.drainItemIds, ...input.warmDrainItemIds]
    );
    const drained = input.inbox.filter((item) => drainable.has(item.id));
    const withheld = input.inbox.filter((item) => !drainable.has(item.id));
    const notice = composeInboxNotice(
        withheld,
        Math.max(withheld.length, input.totalPending - drained.length)
    );
    const body =
        drained.length > 0
            ? [composeInboxDrain(drained, input.homeTimezone), notice].filter(Boolean).join('\n\n')
            : notice;
    return {
        drained,
        notice,
        turnContent: [openingPrompt(session, body), formatUnreadElsewhere(input.unreadElsewhere)]
            .filter(Boolean)
            .join('\n\n'),
    };
}

/** `Start.` is reserved for a cold session with nothing pending. */
function openingPrompt(
    session: { isColdStart: boolean; sessionGeneration: number },
    body: string | null
): string {
    const resetContext = session.sessionGeneration === 1 ? null : resetContextLine;
    if (!session.isColdStart) {
        return body ?? 'Resume the interrupted turn.';
    }
    if (body) {
        return [resetContext, body].filter(Boolean).join('\n\n');
    }
    return resetContext ? `Start.\n${resetContext}` : 'Start.';
}

/**
 * Exact run visibility for bodies this turn composed itself. Only notice-lane
 * items need it: concrete work is served the moment the Computer accepts the
 * run, and its identities address no Chat message. A rendered thread context
 * made its quoted messages visible too, as Raft's receipts for it record.
 */
export async function attestComposedDrain(
    input: TurnDelivery,
    drained: AgentInboxItem[]
): Promise<void> {
    if (input.inboxDelivery !== 'notice' || drained.length === 0) {
        return;
    }
    const location = {
        agentId: input.agentId,
        dataRoot: input.dataRoot,
        serverId: input.serverId,
    };
    const identities = [
        ...drained.map((item) => ({ chatId: item.chatId, id: item.id, sequence: item.sequence })),
        ...[...renderedThreadContexts(drained).values()].flatMap(threadContextVisibleMessages),
    ];
    await recordRunVisibleMessages(location, input.runId, identities);
    await consumeVisibleMessages(location, identities);
}
