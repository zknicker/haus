import {
    type CloudAgentObservation,
    type CloudAgentStatus,
    type CloudAgentWork,
    isTerminalCloudAgentStatus,
} from '@haus/api';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { cloudAgentRunsTable, cloudAgentWorkTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { attentionDedupeKey, isLiveChat, isStalledErrorCode } from './cloud-agent-attention.ts';
import { prepareCloudAgentWorkEvents } from './cloud-agent-events.ts';
import { findCloudAgentWork } from './cloud-agent-shape.ts';
import { mergeBranchEvidence } from './merge-branch-evidence.ts';
import { seedPullRequestReadings } from './pull-request-readings.ts';

export interface AppliedCloudAgentObservation {
    /** One `cloudAgentWork.updated` per linking Message in a live Chat. */
    events: PreparedRealtimeEvent[];
    /** The delegating Agent to wake, set only when a settled Run notified it. */
    wake: { agentId: string; serverId: string } | null;
    work: CloudAgentWork;
}

/**
 * Applies one bounded Computer observation to its Run and work. A duplicate,
 * out-of-order, or post-terminal observation is a no-op: the first terminal
 * result a Run reports is the one that stands. Only the newest Run projects
 * work lifecycle. Every settling Run creates one durable inbox attention for
 * the delegating Agent in the requesting Chat, in the same transaction, unless
 * that Chat has since been deleted; a non-terminal Run whose errorCode still
 * needs one (see `isStalledErrorCode`) creates the same kind of attention
 * without settling, at most once per reminder window.
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
                runStatus: cloudAgentRunsTable.status,
                terminalAt: cloudAgentRunsTable.terminalAt,
                workStartedAt: cloudAgentWorkTable.startedAt,
                workStatus: cloudAgentWorkTable.status,
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
            .set(
                runObservationUpdate(
                    observation,
                    effectiveStatus(observation.status, row.runStatus),
                    row.runStartedAt,
                    row.branches
                )
            )
            .where(
                and(
                    eq(cloudAgentRunsTable.serverId, input.serverId),
                    eq(cloudAgentRunsTable.id, observation.runId)
                )
            );

        await seedPullRequestReadings(tx, {
            branches: observation.branches ?? [],
            now: observedAt,
            serverId: input.serverId,
        });

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
                    ? workObservationUpdate(
                          observation,
                          effectiveStatus(observation.status, row.workStatus),
                          row.workStartedAt
                      )
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

        // Work already settled, cancelled by a human say, has nobody left to act on a stall.
        const stalled =
            !(settling || isTerminalCloudAgentStatus(row.workStatus)) &&
            isStalledErrorCode(observation.errorCode);
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
 * Once addressed, a Run or work record never reads `queued` again. A reading
 * that cannot reconfirm the prompt it already found once (a session log too
 * large to scan back through, say) must not erase that progress and leave
 * the job looking unaddressed, even though every later observation keeps
 * reporting the same stale `queued` until the gap clears (TECH-7).
 */
function effectiveStatus(status: CloudAgentStatus, previous: CloudAgentStatus): CloudAgentStatus {
    return status === 'queued' && previous !== 'queued' ? previous : status;
}

function runObservationUpdate(
    observation: CloudAgentObservation,
    status: CloudAgentStatus,
    previousStart: Date | null,
    previousBranches: Parameters<typeof mergeBranchEvidence>[0]
) {
    const observedAt = new Date(observation.observedAt);
    return {
        ...observationTimes(status, observation, previousStart),
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

function workObservationUpdate(
    observation: CloudAgentObservation,
    status: CloudAgentStatus,
    previousStart: Date | null
) {
    return {
        ...observationTimes(status, observation, previousStart),
        ...(observation.activity
            ? {
                  activityAt: new Date(observation.activity.at),
                  activitySummary: observation.activity.summary,
              }
            : {}),
        ...(observation.environmentId ? { environmentId: observation.environmentId } : {}),
        ...(observation.environmentName ? { environmentName: observation.environmentName } : {}),
        ...(observation.providerAgentId ? { providerAgentId: observation.providerAgentId } : {}),
        ...(observation.providerUrl ? { providerUrl: observation.providerUrl } : {}),
        updatedAt: new Date(observation.observedAt),
    };
}

function observationTimes(
    status: CloudAgentStatus,
    observation: CloudAgentObservation,
    previousStart: Date | null
) {
    const observedAt = new Date(observation.observedAt);
    const startedAt = observation.startedAt ? new Date(observation.startedAt) : observedAt;
    return {
        ...(status !== 'queued' && (!previousStart || startedAt < previousStart)
            ? { startedAt }
            : {}),
        status,
        terminalAt: isTerminalCloudAgentStatus(status) ? observedAt : null,
    };
}
