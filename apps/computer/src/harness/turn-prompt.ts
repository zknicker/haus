import {
    type AgentInboxItem,
    composeDriveConflictInput,
    composeInboxDrain,
    composeInboxNotice,
    composeTaskAssignmentInput,
    composeTurnContent,
    subagentWakeTurnLine,
    type TurnSessionFacts,
} from '@haus/agent-prompt';
import type { ConnectionChipKind } from '@haus/api';
import type { AgentStartCommand, UnreadElsewhere } from '../agent-commands.ts';
import {
    consumeVisibleMessages,
    recordRunVisibleMessages,
    type VisibleMessageIdentity,
} from '../inbox-store.ts';

/** What the frame offers this turn, independent of how the turn was started. */
export interface TurnDelivery {
    agentId: string;
    /** Reports model-visible identities to the Server; null when it accepted none. */
    attestVisible?(
        identities: VisibleMessageIdentity[],
        signal: AbortSignal
    ): Promise<VisibleMessageIdentity[] | null>;
    /** Chips the Server's connections add to chat, for the system prompt's Formatting refs. */
    connectionChips?: readonly ConnectionChipKind[];
    dataRoot: string;
    /** Inbox identities drainable on any start; the warm set needs a live session. */
    drainItemIds: string[];
    /** A Drive conflict run: one push's conflicts, and the Agent's handle to tell its edits apart. */
    driveConflict?: {
        attention: NonNullable<AgentStartCommand['driveConflict']>;
        ownHandle: string | null;
    };
    /** The Server attached the new Agent's one-time greeting to this run. */
    greets?: boolean;
    homeTimezone: string;
    inbox: AgentInboxItem[];
    inboxDelivery: 'concrete' | 'notice';
    runId: string;
    serverId: string;
    /** A sub-agent wake run: background work the Agent started finished or stopped. */
    subagentWake?: AgentStartCommand['subagentWake'];
    /** A Task assignment run: the Tasks handed to the Agent, in its main session. */
    taskAssignments?: AgentStartCommand['taskAssignments'];
    totalPending: number;
    unreadElsewhere: UnreadElsewhere[];
    warmDrainItemIds: string[];
}

/** The delivery facets of a start command, exactly as one turn composes them. */
export function turnDeliveryOf(command: AgentStartCommand) {
    return {
        connectionChips: command.connectionChips ?? [],
        ...(command.driveConflict
            ? {
                  driveConflict: {
                      attention: command.driveConflict,
                      ownHandle: command.agentName ?? null,
                  },
              }
            : {}),
        ...(command.subagentWake ? { subagentWake: command.subagentWake } : {}),
        ...(command.taskAssignments ? { taskAssignments: command.taskAssignments } : {}),
        drainItemIds: command.drainItemIds ?? [],
        greets: command.greets === true,
        inbox: command.inbox ?? [],
        inboxDelivery: command.inboxDelivery,
        totalPending: command.totalPending,
        unreadElsewhere: command.unreadElsewhere ?? [],
        warmDrainItemIds: command.warmDrainItemIds ?? [],
    };
}

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
export function composeTurnPrompt(input: TurnDelivery, session: TurnSessionFacts): TurnPrompt {
    const chatlessLine = composeChatlessInput(input);
    if (chatlessLine) {
        return {
            drained: [],
            notice: null,
            turnContent: composeTurnContent(session, {
                body: chatlessLine,
                greets: false,
                unreadElsewhere: [],
            }),
        };
    }
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
        turnContent: composeTurnContent(session, {
            body,
            greets: input.greets === true,
            unreadElsewhere: input.unreadElsewhere,
        }),
    };
}

/** The whole input of a chatless main-session run, or null for an ordinary inbox turn. */
function composeChatlessInput(input: TurnDelivery): string | null {
    if (input.taskAssignments) {
        return composeTaskAssignmentInput(input.taskAssignments);
    }
    if (input.driveConflict) {
        return composeDriveConflictInput(
            input.driveConflict.attention,
            input.driveConflict.ownHandle
        );
    }
    return input.subagentWake ? subagentWakeTurnLine : null;
}

/**
 * Exact run visibility for bodies this turn composed itself. Only notice-lane
 * items need it: concrete work is served the moment the Computer accepts the
 * run, and its identities address no Chat message.
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
    const identities = drained.map((item) => ({
        chatId: item.chatId,
        id: item.id,
        sequence: item.sequence,
    }));
    await recordRunVisibleMessages(location, input.runId, identities);
    await reportComposedVisibility(input, identities);
    await consumeVisibleMessages(location, identities);
}

// The Server refuses a receipt until it has processed the start ack, which
// travels over the attachment socket rather than this request's connection.
const receiptRetryDelaysMs = [0, 100, 300, 800];
const receiptAttemptTimeoutMs = 2000;
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
