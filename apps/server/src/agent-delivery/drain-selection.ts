import { type AgentCommand, isChatlessInboxSource } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import { type AgentDispatchConfig, startPromptFacts } from './dispatch-config.ts';
import { attachQueuedGreeting, isGreetingRow, retireSpentGreeting } from './greeting.ts';
import { heartbeatLeadGate, heartbeatStartFrame } from './heartbeat-run.ts';
import { buildInboxItems } from './inbox-items.ts';
import {
    isConcreteInboxSource as isConcreteSource,
    isNoticelessInboxSource,
} from './inbox-lanes.ts';
import type { AgentDeliveryRow } from './store.ts';
import * as store from './store.ts';
import { readThreadContexts, threadContextChars } from './thread-context.ts';
import { readUnreadElsewhere } from './unread-elsewhere.ts';

/** Bounds one drain so the composed prompt stays well under command/env limits. */
export const maxDrainRows = 50;
const maxDrainChars = 24_000;

/**
 * Rebuilds an in-flight run's frame from durable state. A resend must reproduce
 * the same drain sets and digest, or a replayed run composes a prompt the
 * ledger does not expect.
 */
export async function startFrame(
    db: HausDatabase,
    state: AgentDeliveryRow,
    config: Pick<
        AgentDispatchConfig,
        | 'agentConversationStyle'
        | 'agentDescription'
        | 'agentName'
        | 'agentSignatureEmoji'
        | 'connectionChips'
        | 'homeTimezone'
        | 'sessionGeneration'
    >
): Promise<AgentCommand> {
    // A replay into a session that already posted the introduction must not greet again.
    await retireSpentGreeting(db, state.agentId);
    const attachedRows = state.activeRunId
        ? await store.listInboxItemsForRun(db, {
              agentId: state.agentId,
              runId: state.activeRunId,
          })
        : [];
    // A greeting rides the run without being one of its items (greeting.ts).
    const greets = attachedRows.some(isGreetingRow);
    const runRows = attachedRows.filter((row) => !isGreetingRow(row));
    const chatlessRow = runRows.find((row) => isChatlessInboxSource(row.source));
    if (chatlessRow) {
        return await heartbeatStartFrame(db, state, config, chatlessRow);
    }
    const noticeRows =
        runRows.length === 0 && state.activeRunId
            ? (
                  await store.listNoticedItemsForRun(db, {
                      agentId: state.agentId,
                      runId: state.activeRunId,
                  })
              ).filter((row) => !isNoticelessInboxSource(row.source))
            : [];
    const humanDrain = await humanDrainSets(db, noticeRows);
    return {
        agentId: state.agentId,
        ...startPromptFacts(config),
        agentName: config.agentName,
        chatId: state.activeRunChatId ?? '',
        drainItemIds: [...runRows, ...humanDrain.drainRows].map((row) => row.dedupeKey),
        ...(greets ? { greets: true as const } : {}),
        homeTimezone: config.homeTimezone,
        inbox: await buildInboxItems(db, runRows.length > 0 ? runRows : noticeRows, state.agentId),
        inboxDelivery: runRows.length > 0 ? 'concrete' : 'notice',
        modelId: state.activeRunModelId ?? '',
        runId: state.activeRunId ?? '',
        runtimeId: state.activeRunRuntimeId ?? '',
        sessionGeneration: config.sessionGeneration,
        totalPending: await store.countQueuedNoticeItems(db, state.agentId),
        type: 'start',
        unreadElsewhere: await readUnreadElsewhere(db, {
            agentId: state.agentId,
            drainedItemIds: runRows.map((row) => row.id),
            representedChatIds: chatIdsOf(noticeRows),
            serverId: state.serverId,
        }),
        warmDrainItemIds: humanDrain.warmDrainRows.map((row) => row.dedupeKey),
    };
}

/**
 * Claims the rows a fresh run carries: concrete rows attach to it, notice-lane
 * rows are offered within the notice window, and a queued greeting rides it
 * whatever leads (greeting.ts). {@link startFrame} rebuilds the same sets from
 * these persisted claims on every resend.
 */
export async function claimRunItems(
    tx: HausDatabase,
    input: { agentId: string; concrete: boolean; runId: string; selected: store.InboxItemRow[] }
) {
    const { agentId, runId } = input;
    const greets = await attachQueuedGreeting(tx, { agentId, runId });
    const selected = input.selected.filter((row) => !isGreetingRow(row));
    if (input.concrete) {
        await store.attachQueuedItemsToRun(tx, {
            agentId,
            itemIds: selected.map((row) => row.id),
            runId,
        });
        return { drainRows: selected, greets, noticeRows: [], selected, warmDrainRows: [] };
    }
    const noticeRows = noticeWindow(
        (await store.listQueuedItems(tx, agentId, 1000)).filter(
            (row) => !isConcreteSource(row.source)
        ),
        selected
    );
    await store.markInboxItemsNoticed(tx, {
        agentId,
        initial: true,
        itemIds: noticeRows.map((row) => row.id),
        runId,
    });
    // Derived from the rows this frame carries, not from the candidate slice,
    // so a resend rebuilding from those same persisted rows reproduces them.
    const { drainRows, warmDrainRows } = await humanDrainSets(tx, noticeRows);
    return { drainRows, greets, noticeRows, selected, warmDrainRows };
}

/**
 * The candidates a fresh drain chooses from, the row it prefers to lead, and
 * which rows may lead now. Attentions that may no longer run (a stale
 * heartbeat, a spent greeting) are retired first, so neither can lead an empty
 * run. `mayLead` applies to the candidates and again to the admitted lead,
 * since admission at the chain ceiling may widen to a row it was not offered.
 */
export async function readDrainCandidates(tx: HausDatabase, agentId: string) {
    const heartbeatMayLead = await heartbeatLeadGate(tx, agentId);
    await retireSpentGreeting(tx, agentId);
    // Sequential: planning runs inside the transaction holding the Server
    // row, and overlapping reads on its one connection wedge it.
    const unnoticed = await store.listUnnoticedQueuedItems(tx, agentId, maxDrainRows);
    const concreteRows = await store.listQueuedConcreteItems(tx, agentId, maxDrainRows);
    const queued = [
        ...new Map([...unnoticed, ...concreteRows].map((row) => [row.id, row])).values(),
    ];
    const greetingWaits = queued.some(isGreetingRow);
    const mayLead = (row: Pick<store.InboxItemRow, 'source'>) =>
        heartbeatMayLead(row) && !(greetingWaits && waitsForGreeting(row.source));
    const candidates = queued.filter(mayLead);
    return { candidates, lead: preferredDrainLead(candidates), mayLead };
}

/**
 * The row a drain prefers to lead with. Concrete work leads its own run: its
 * envelope exists nowhere but the inbox, so it enters the first prompt instead
 * of waiting behind a notice the Agent may never pull. A greeting leads only
 * when nothing else waits; otherwise it rides whatever run does lead.
 */
function preferredDrainLead(rows: store.InboxItemRow[]): store.InboxItemRow | undefined {
    return (
        rows.find((row) => row.source === 'onboarding') ??
        rows.find((row) => isConcreteSource(row.source)) ??
        rows.find((row) => !isGreetingRow(row)) ??
        rows[0]
    );
}

/**
 * A chatless run cannot carry the greeting, so while one waits a dream,
 * heartbeat, or heartbeat report does not lead: a report would otherwise open
 * the new Agent's main session without it. A sub-agent wake is never held
 * (specs/heartbeat.md): it exists only after the main session ran, and the
 * greeting rides the next ordinary run, which shows it warm or cold.
 */
function waitsForGreeting(source: string): boolean {
    return isChatlessInboxSource(source) && source !== 'subagent';
}

/**
 * One drain never mixes the lanes, and a concrete drain never mixes kinds: a
 * fire, a task assignment, a Cloud Agent result, and Cove's bootstrap each earn
 * their own dedicated wake, which is also what keeps the sole-fire cause
 * inference readable (specs/inbox.md).
 */
export function boundedCompatibleRows(
    rows: store.InboxItemRow[],
    source: string,
    extraChars: (row: store.InboxItemRow) => number = () => 0
) {
    const selected: store.InboxItemRow[] = [];
    let chars = 0;
    for (const row of rows) {
        if (isConcreteSource(source) ? row.source !== source : isConcreteSource(row.source)) {
            continue;
        }
        const nextChars = chars + row.content.length + extraChars(row);
        if (selected.length > 0 && (selected.length >= maxDrainRows || nextChars > maxDrainChars)) {
            break;
        }
        selected.push(row);
        chars = nextChars;
    }
    return selected;
}

/**
 * The two drain sets a notice-lane frame offers, derived from the rows that
 * frame carries. Both the first dispatch and every resend compute them from the
 * same persisted notice window, so a replayed run composes the prompt the ledger
 * expects; the drain budget still bounds how much of it may become bodies. A
 * Thread mention's context package counts against that budget whether or not
 * visibility later omits it, which keeps the sets identical on every resend.
 */
export async function humanDrainSets(db: HausDatabase, noticeRows: store.InboxItemRow[]) {
    const humanRows = noticeRows.filter((row) => row.source === 'human');
    const contexts = await readThreadContexts(db, humanRows);
    const drainable = boundedCompatibleRows(humanRows, 'human', (row) => {
        const context = contexts.get(row.id);
        return context ? threadContextChars(context) : 0;
    });
    return {
        drainRows: drainable.filter(isAddressedHumanRow),
        warmDrainRows: drainable.filter((row) => !isAddressedHumanRow(row)),
    };
}

/**
 * A human item this Agent was named in: a DM, an @mention, or a Jev routing
 * that committed the message to it alone (ADR 0030). Raft wakes an alive Agent
 * with every human body; Haus additionally drains these on a cold start, where
 * a notice would otherwise leave a direct question unanswered (ADR 0034).
 */
export function isAddressedHumanRow(row: store.InboxItemRow): boolean {
    return row.source === 'human' && row.addressedReason !== null;
}

export function chatIdsOf(rows: store.InboxItemRow[]): string[] {
    return [...new Set(rows.flatMap((row) => (row.chatId ? [row.chatId] : [])))];
}

export function noticeWindow(
    queued: store.InboxItemRow[],
    mustInclude: store.InboxItemRow[]
): store.InboxItemRow[] {
    const selected = new Map(mustInclude.map((row) => [row.id, row]));
    for (const row of queued) {
        if (selected.size >= maxDrainRows) {
            break;
        }
        selected.set(row.id, row);
    }
    return [...selected.values()].sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime()
    );
}
