import {
    type CloudAgentObservation,
    type CloudAgentWork,
    isTerminalCloudAgentStatus,
} from '@haus/api';
import { and, desc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, cloudAgentRunsTable, cloudAgentWorkTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { prepareCloudAgentWorkEvents } from './cloud-agent-events.ts';
import { findCloudAgentWork } from './cloud-agent-shape.ts';
import { linkParentChatsTable } from './cloud-agent-work-visibility.ts';
import { mergeBranchEvidence } from './merge-branch-evidence.ts';

export interface AppliedCloudAgentObservation {
    /** One `cloudAgentWork.updated` per linking Message in a live Chat. */
    events: PreparedRealtimeEvent[];
    /** The delegating Agent to wake, set only when a settled Run notified it. */
    wake: { agentId: string; serverId: string } | null;
    work: CloudAgentWork;
}

/**
 * Computer tries this once a follow-up's send keeps failing past its own
 * grace period: ask the provider to clear whatever holds the session busy
 * (`send --interrupt`'s own mechanism), then retry the send right away. A
 * follow-up still queued and retrying carries this errorCode when even that
 * didn't deliver it — never on its own a reason to settle. One inbox
 * attention still wakes the delegating Agent, so it is never silent, but
 * sparse reminders replace a terminal failure: Computer reports the same
 * errorCode on every retry tick, and this dedupes every report inside one
 * window to the same attention, then opens a fresh one each time a new
 * window starts. There is no shared enum for the string: the Computer side
 * and the website status line each compare this literal, the same way
 * `cloud-agent-presentation.ts` already compares raw `launch-` and
 * `provider-launch-` prefixes without one.
 */
const followUpAutoInterruptFailedErrorCode = 'followup-auto-interrupt-failed';
/** How often a follow-up still stuck after that gets another reminder. */
const followUpStallReminderMs = 2 * 60 * 60_000;

/**
 * Applies one bounded Computer observation to its Run and work. A duplicate,
 * out-of-order, or post-terminal observation is a no-op: the first terminal
 * result a Run reports is the one that stands. Only the newest Run projects
 * work lifecycle. Every settling Run creates one durable inbox attention for
 * the delegating Agent in the requesting Chat, in the same transaction, unless
 * that Chat has since been deleted; a follow-up an auto-interrupt still
 * couldn't deliver (see `followUpAutoInterruptFailedErrorCode`) creates the
 * same kind of attention without settling, at most once per reminder window.
 */
export async function applyCloudAgentObservation(
    db: HausDatabase,
    input: { computerId: string; observation: CloudAgentObservation; serverId: string },
    agentDelivery: AgentDelivery
): Promise<AppliedCloudAgentObservation | null> {
    const { observation } = input;
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const [row] = await tx
            .select({
                agentId: cloudAgentWorkTable.agentId,
                branches: cloudAgentRunsTable.branches,
                chatId: cloudAgentWorkTable.chatId,
                computerId: cloudAgentWorkTable.computerId,
                observedAt: cloudAgentRunsTable.observedAt,
                runStartedAt: cloudAgentRunsTable.startedAt,
                terminalAt: cloudAgentRunsTable.terminalAt,
                workStartedAt: cloudAgentWorkTable.startedAt,
            })
            .from(cloudAgentRunsTable)
            .innerJoin(
                cloudAgentWorkTable,
                and(
                    eq(cloudAgentWorkTable.serverId, cloudAgentRunsTable.serverId),
                    eq(cloudAgentWorkTable.id, cloudAgentRunsTable.workId)
                )
            )
            .where(
                and(
                    eq(cloudAgentRunsTable.serverId, input.serverId),
                    eq(cloudAgentRunsTable.id, observation.runId),
                    eq(cloudAgentRunsTable.workId, observation.workId)
                )
            )
            .limit(1);
        if (!row || row.computerId !== input.computerId) {
            return null;
        }
        const observedAt = new Date(observation.observedAt);
        if (row.terminalAt || (row.observedAt && row.observedAt >= observedAt)) {
            return null;
        }

        const settling = isTerminalCloudAgentStatus(observation.status);
        await tx
            .update(cloudAgentRunsTable)
            .set(runObservationUpdate(observation, row.runStartedAt, row.branches))
            .where(
                and(
                    eq(cloudAgentRunsTable.serverId, input.serverId),
                    eq(cloudAgentRunsTable.id, observation.runId)
                )
            );

        const [latestRun] = await tx
            .select({ id: cloudAgentRunsTable.id })
            .from(cloudAgentRunsTable)
            .where(
                and(
                    eq(cloudAgentRunsTable.serverId, input.serverId),
                    eq(cloudAgentRunsTable.workId, observation.workId)
                )
            )
            .orderBy(desc(cloudAgentRunsTable.createdAt))
            .limit(1);
        // An older Run still reports while a follow-up waits behind it. It never
        // projects lifecycle, but it is news: without this the job reads as quiet.
        await tx
            .update(cloudAgentWorkTable)
            .set(
                latestRun?.id === observation.runId
                    ? workObservationUpdate(observation, row.workStartedAt)
                    : {
                          updatedAt: sql`greatest(${cloudAgentWorkTable.updatedAt}, ${observation.observedAt}::timestamptz)`,
                      }
            )
            .where(
                and(
                    eq(cloudAgentWorkTable.serverId, input.serverId),
                    eq(cloudAgentWorkTable.id, observation.workId)
                )
            );

        const stalled = !settling && observation.errorCode === followUpAutoInterruptFailedErrorCode;
        // The notice goes to the Chat that asked for the work, never to a later
        // link (ADR 0044). If that Chat is gone, the work settles (or keeps
        // retrying) silently.
        const notifying =
            (settling || stalled) &&
            (await isLiveChat(tx, { chatId: row.chatId, serverId: input.serverId }));
        if (notifying) {
            await agentDelivery.enqueue(tx, {
                agentId: row.agentId,
                chatId: row.chatId,
                content: '',
                dedupeKey: attentionDedupeKey(observation, stalled, observedAt),
                serverId: input.serverId,
                source: 'cloud_agent_work',
            });
        }

        const work = await findCloudAgentWork(tx, input.serverId, observation.workId);
        if (!work) {
            throw new Error('The Cloud Agent work could not be projected after an observation.');
        }
        return {
            events: await prepareCloudAgentWorkEvents(tx, {
                serverId: input.serverId,
                workId: observation.workId,
            }),
            wake: notifying ? { agentId: row.agentId, serverId: input.serverId } : null,
            work,
        };
    });
}

/**
 * A settling Run gets exactly one attention, keyed by its own id. A stall
 * repeats on every retry tick, so its key buckets by wall-clock window
 * instead: the same bucket collapses to the same attention, and the next
 * bucket opens a fresh one.
 */
function attentionDedupeKey(
    observation: CloudAgentObservation,
    stalled: boolean,
    observedAt: Date
): string {
    if (!stalled) {
        return observation.runId;
    }
    const window = Math.floor(observedAt.getTime() / followUpStallReminderMs);
    return `${observation.runId}:stall:${window}`;
}

/** A Chat that still exists and is not tombstoned, nor is its parent. */
async function isLiveChat(db: HausDatabase, input: { chatId: string; serverId: string }) {
    const [chat] = await db
        .select({ id: chatsTable.id })
        .from(chatsTable)
        .leftJoin(
            linkParentChatsTable,
            and(
                eq(linkParentChatsTable.serverId, chatsTable.serverId),
                eq(linkParentChatsTable.id, chatsTable.parentChatId)
            )
        )
        .where(
            and(
                eq(chatsTable.serverId, input.serverId),
                eq(chatsTable.id, input.chatId),
                isNull(chatsTable.deletedAt),
                or(
                    isNull(chatsTable.parentChatId),
                    and(isNotNull(linkParentChatsTable.id), isNull(linkParentChatsTable.deletedAt))
                )
            )
        )
        .limit(1);
    return chat !== undefined;
}

function runObservationUpdate(
    observation: CloudAgentObservation,
    previousStart: Date | null,
    previousBranches: Parameters<typeof mergeBranchEvidence>[0]
) {
    const observedAt = new Date(observation.observedAt);
    return {
        ...observationTimes(observation, previousStart),
        ...(observation.branches
            ? { branches: mergeBranchEvidence(previousBranches, observation.branches) }
            : {}),
        // Always written, never merely spread: a Run only ever receives further
        // observations before it settles, and a stall's errorCode/summary must
        // clear once the follow-up resolves, not linger from an earlier tick.
        errorCode: observation.errorCode ?? null,
        observedAt,
        ...(observation.providerRunId ? { providerRunId: observation.providerRunId } : {}),
        ...(observation.rawStatus ? { rawStatus: observation.rawStatus } : {}),
        summary: observation.summary ?? null,
        ...(observation.usage ? { usage: observation.usage } : {}),
    };
}

function workObservationUpdate(observation: CloudAgentObservation, previousStart: Date | null) {
    return {
        ...observationTimes(observation, previousStart),
        ...(observation.activity
            ? {
                  activityAt: new Date(observation.activity.at),
                  activitySummary: observation.activity.summary,
              }
            : {}),
        ...(observation.providerAgentId ? { providerAgentId: observation.providerAgentId } : {}),
        ...(observation.providerUrl ? { providerUrl: observation.providerUrl } : {}),
        updatedAt: new Date(observation.observedAt),
    };
}

function observationTimes(observation: CloudAgentObservation, previousStart: Date | null) {
    const observedAt = new Date(observation.observedAt);
    const startedAt = observation.startedAt ? new Date(observation.startedAt) : observedAt;
    return {
        ...(observation.status !== 'queued' && (!previousStart || startedAt < previousStart)
            ? { startedAt }
            : {}),
        status: observation.status,
        terminalAt: isTerminalCloudAgentStatus(observation.status) ? observedAt : null,
    };
}
