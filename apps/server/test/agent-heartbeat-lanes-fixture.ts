import type { UsageOverview } from '@haus/api';
import { eq } from 'drizzle-orm';
import {
    dreamDedupeKey,
    heartbeatDedupeKey,
    heartbeatReportDedupeKey,
} from '../src/agent-delivery/heartbeat-keys.ts';
import * as store from '../src/agent-delivery/store.ts';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentDeliveryTable,
    agentInboxTable,
    agentRunTriggersTable,
    agentsTable,
    agentTurnsTable,
    chatMessagesTable,
    computersTable,
} from '../src/postgres/schema.ts';
import type { Seed } from './agent-inbox-harness.ts';

let sequence = 5_000_000;

export interface RunInput {
    createdAt?: Date;
    endedAt?: Date;
    kind?: 'daytime' | 'nightly';
    runId?: string;
    runtimeId?: string;
    slot?: string;
    startedAt: Date;
    /** Omit for a run with no turn yet. */
    status?: 'completed' | 'failed' | 'interrupted';
    tokens?: number;
}

/** One heartbeat or dream run: its trigger, and its settled turn when `status` is given. */
export async function insertRun(db: HausDatabase, seed: Seed, input: RunInput): Promise<string> {
    const runId = input.runId ?? createOpaqueId('run');
    const kind = input.kind ?? 'daytime';
    await db.insert(agentRunTriggersTable).values({
        agentId: seed.agentId,
        createdAt: input.createdAt ?? input.startedAt,
        runId,
        serverId: seed.serverId,
        source: kind === 'nightly' ? 'dream' : 'heartbeat',
        workId:
            kind === 'nightly'
                ? dreamDedupeKey(seed.agentId, '2026-10-11')
                : heartbeatDedupeKey(seed.agentId, '2026-10-11', input.slot ?? runId),
    });
    if (input.status) {
        await insertTurn(db, seed, { ...input, runId, status: input.status });
    }
    return runId;
}

export async function insertTurn(
    db: HausDatabase,
    seed: Seed,
    input: RunInput & { runId: string; status: 'completed' | 'failed' | 'interrupted' }
) {
    await db.insert(agentTurnsTable).values({
        agentId: seed.agentId,
        computerId: seed.computerId,
        endedAt: input.endedAt ?? new Date(input.startedAt.getTime() + 60_000),
        id: createOpaqueId('atn'),
        runId: input.runId,
        runtimeId: input.runtimeId ?? 'fake',
        serverId: seed.serverId,
        startedAt: input.startedAt,
        status: input.status,
        summary: 'ok',
        totalTokens: input.tokens ?? 0,
    });
}

/** The run is the Agent's active run, so it reads as running while it has no turn. */
export async function makeActive(db: HausDatabase, seed: Seed, runId: string) {
    await store.ensureDeliveryState(db, { agentId: seed.agentId, serverId: seed.serverId });
    await db
        .update(agentDeliveryTable)
        .set({
            activeRunComputerId: seed.computerId,
            activeRunId: runId,
            activeRunModelId: 'fake-model',
            activeRunReasoningEffort: 'default',
            activeRunRuntimeId: 'fake',
        })
        .where(eq(agentDeliveryTable.agentId, seed.agentId));
}

/**
 * The report a heartbeat run filed, read by a main-session run that posted in `chatId`
 * (or stayed quiet when it is null).
 */
export async function fileReport(
    db: HausDatabase,
    seed: Seed,
    heartbeatRunId: string,
    text: string,
    postedIn: { chatId: string; postedAt: Date } | null
) {
    const reportRunId = createOpaqueId('run');
    await db.insert(agentRunTriggersTable).values({
        agentId: seed.agentId,
        runId: reportRunId,
        serverId: seed.serverId,
        source: 'heartbeat_report',
        workId: heartbeatReportDedupeKey(heartbeatRunId),
    });
    await db.insert(agentInboxTable).values({
        agentId: seed.agentId,
        chatId: null,
        content: text,
        dedupeKey: heartbeatReportDedupeKey(heartbeatRunId),
        id: createOpaqueId('inb'),
        runId: reportRunId,
        serverId: seed.serverId,
        settledRunId: reportRunId,
        source: 'heartbeat_report',
        state: 'seen',
    });
    if (postedIn) {
        sequence += 1;
        await db.insert(chatMessagesTable).values({
            authorAgentId: seed.agentId,
            chatId: postedIn.chatId,
            content: 'Heads up.',
            createdAt: postedIn.postedAt,
            id: createOpaqueId('msg'),
            nonce: createOpaqueId('nonce'),
            runId: reportRunId,
            sequence,
            serverId: seed.serverId,
        });
    }
}

export async function useRuntime(db: HausDatabase, seed: Seed, runtimeId: string) {
    await db
        .update(agentsTable)
        .set({ desiredRuntimeId: runtimeId })
        .where(eq(agentsTable.id, seed.agentId));
}

/** A Computer usage snapshot with one reported weekly meter. */
export async function reportMeter(
    db: HausDatabase,
    seed: Seed,
    meter: { resetsAt: Date | null; runtime: 'claude-code' | 'codex'; usedPercent: number }
) {
    const capturedAt = new Date().toISOString();
    const resetsAt = meter.resetsAt?.toISOString() ?? null;
    const usage = {
        capturedAt,
        claude:
            meter.runtime === 'claude-code'
                ? {
                      provider: 'claude',
                      snapshot: {
                          capturedAt,
                          extraUsage: null,
                          provider: 'claude',
                          source: 'anthropic-oauth-usage',
                          subscriptionType: 'max',
                          windows: [
                              {
                                  id: 'current-week-all-models',
                                  label: 'Week',
                                  remainingPercent: 100 - meter.usedPercent,
                                  resetsAt,
                                  usedPercent: meter.usedPercent,
                              },
                          ],
                      },
                      status: 'ok',
                  }
                : {
                      error: { code: 'unknown', message: 'x', name: 'x' },
                      provider: 'claude',
                      status: 'error',
                  },
        codex:
            meter.runtime === 'codex'
                ? {
                      provider: 'codex',
                      snapshot: {
                          capturedAt,
                          creditsBalance: null,
                          planType: 'pro',
                          provider: 'codex',
                          source: 'chatgpt-wham-usage',
                          windows: [
                              {
                                  id: 'current-week',
                                  label: 'Week',
                                  remainingPercent: 100 - meter.usedPercent,
                                  resetAfterSeconds: null,
                                  resetsAt,
                                  usedPercent: meter.usedPercent,
                              },
                          ],
                      },
                      status: 'ok',
                  }
                : {
                      error: { code: 'unknown', message: 'x', name: 'x' },
                      provider: 'codex',
                      status: 'error',
                  },
        connectedProviders: [],
        grok: {
            error: { code: 'unknown', message: 'x', name: 'x' },
            provider: 'grok',
            status: 'error',
        },
        openRouter: { error: null, overview: {}, status: 'error' },
        runtimeUsage: [],
    } as unknown as UsageOverview;
    await db
        .update(computersTable)
        .set({ usageSnapshot: usage })
        .where(eq(computersTable.id, seed.computerId));
}
