import type { UnreadElsewhere } from '../agent-commands.ts';
import type { AgentInboxItem } from '../agent-inbox-item.ts';
import { composeInboxDrain, composeInboxNotice, formatUnreadElsewhere } from '../inbox-format.ts';
import {
    consumeVisibleMessages,
    recordRunVisibleMessages,
    type VisibleMessageIdentity,
} from '../inbox-store.ts';
import { renderedThreadContexts, threadContextVisibleMessages } from '../thread-context-format.ts';

/** What the frame offers this turn, independent of how the turn was started. */
export interface TurnDelivery {
    agentId: string;
    /** Reports model-visible identities to the Server; null when it accepted none. */
    attestVisible?(
        identities: VisibleMessageIdentity[],
        signal: AbortSignal
    ): Promise<VisibleMessageIdentity[] | null>;
    dataRoot: string;
    /** Inbox identities drainable on any start; the warm set needs a live session. */
    drainItemIds: string[];
    /** An Agent another Agent created with a standing brief introduces itself once. */
    greetsOnFirstTurn?: boolean;
    homeTimezone: string;
    inbox: AgentInboxItem[];
    inboxDelivery: 'concrete' | 'notice';
    runId: string;
    serverId: string;
    totalPending: number;
    unreadElsewhere: UnreadElsewhere[];
    warmDrainItemIds: string[];
}

/**
 * Haus interrupted the previous turn. Claude Code records the cancelled tool call as the user
 * declining it, so without this the Agent tells the requester its work was refused.
 */
const interruptedTurnLine =
    'Your previous turn was interrupted by Haus (a Stop, a restart, or a stalled-turn timeout), not by anyone in the conversation. A tool call it cancelled may read as declined or rejected by the user; nobody declined it, and its side effects may be partial. Any work that turn left unfinished is offered again here.';

interface TurnSession {
    isColdStart: boolean;
    /** The resumed conversation ends in a turn Haus interrupted. */
    resumesInterruptedTurn?: boolean;
    sessionGeneration: number;
}

const resetContextLine =
    'Fresh session: your previous conversation context is gone. Your workspace and MEMORY.md are intact; MEMORY.md is your recovery point.';

/**
 * Raft's new-Agent greeting is a private one-time instruction, so it rides the
 * first turn's input instead of becoming permanent memory.
 */
const firstTurnGreetingLine =
    'On your first turn, say hello in #all in your own voice: who you are, what you own, and what your first output will be and when.';

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
export function composeTurnPrompt(input: TurnDelivery, session: TurnSession): TurnPrompt {
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
            ? [composeInboxDrain(drained), notice].filter(Boolean).join('\n\n')
            : notice;
    return {
        drained,
        notice,
        turnContent: [
            session.resumesInterruptedTurn ? interruptedTurnLine : null,
            openingPrompt(session, body, input.greetsOnFirstTurn === true),
            formatUnreadElsewhere(input.unreadElsewhere),
        ]
            .filter(Boolean)
            .join('\n\n'),
    };
}

/**
 * `Start.` is reserved for a cold session with nothing pending. The first
 * generation's cold start is the Agent's first turn ever: a later generation
 * gets the reset line instead, and a cold start that failed never persisted its
 * session, so the retry is still the first turn.
 */
function openingPrompt(session: TurnSession, body: string | null, greets: boolean): string {
    if (!session.isColdStart) {
        return body ?? 'Resume the interrupted turn.';
    }
    const firstGeneration = session.sessionGeneration === 1;
    const coldNote = firstGeneration ? (greets ? firstTurnGreetingLine : null) : resetContextLine;
    if (body) {
        return [coldNote, body].filter(Boolean).join('\n\n');
    }
    return coldNote ? `Start.\n${coldNote}` : 'Start.';
}

/**
 * Exact run visibility for bodies this turn composed itself. Only notice-lane
 * items need it: concrete work is served the moment the Computer accepts the
 * run, and its identities address no Chat message. A rendered thread context
 * made its quoted messages visible too, as Raft's receipts for it record.
 *
 * The Server hears about them before the model streams, not at settlement:
 * its freshness hold treats any message it has not seen served to this run as
 * news, so a lagging receipt would hold the Agent's reply to its own wake
 * message. The local record written first is the crash fallback that the
 * turn summary replays.
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
    await reportComposedVisibility(input, identities);
    await consumeVisibleMessages(location, identities);
}

// The Server refuses a receipt until it has processed the start ack, which
// travels over the attachment socket rather than this request's connection.
const receiptRetryDelaysMs = [0, 100, 300, 800];
const receiptAttemptTimeoutMs = 2000;
/** The Server's per-receipt cap; a full drain plus thread context can exceed it. */
const receiptBatchSize = 100;

async function reportComposedVisibility(
    input: TurnDelivery,
    identities: VisibleMessageIdentity[]
): Promise<void> {
    const attest = input.attestVisible;
    if (!attest) {
        return;
    }
    for (let start = 0; start < identities.length; start += receiptBatchSize) {
        const batch = identities.slice(start, start + receiptBatchSize);
        for (const delay of receiptRetryDelaysMs) {
            if (delay > 0) {
                await Bun.sleep(delay);
            }
            const accepted = await attest(
                batch,
                AbortSignal.timeout(receiptAttemptTimeoutMs)
            ).catch(() => null);
            if (accepted) {
                break;
            }
        }
    }
}
