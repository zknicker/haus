import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
    asError,
    type HeartbeatCheckOutcome,
    type HeartbeatSkipReason,
    withTelemetrySpan,
} from '@haus/effect';
import { Effect } from 'effect';
import { readAppliedAgentConfiguration } from './agent-configuration.ts';
import type { AttachmentConnectionWork } from './attachment-connection-work.ts';
import type { AttachmentDaemonWork } from './attachment-daemon-work.ts';
import type { DaemonRuntime } from './daemon-runtime.ts';
import { dueHeartbeatSlot, type HeartbeatSlot, slotKey } from './heartbeat-slots.ts';

/** How often the timer looks for a due slot; each Agent is still asked once per slot. */
export const heartbeatCheckInterval = '10 minutes';

export interface HeartbeatScheduleInput {
    /** This attachment's `servers/<serverId>/agents` partition. */
    agentsDir: string;
    daemonWork: Pick<AttachmentDaemonWork, 'resettingAgents' | 'retiredAgents' | 'send'>;
    /** Slots this process already finished per Agent, including skips. */
    handled: Map<string, string>;
    now?: () => Date;
    runtime: DaemonRuntime;
}

/** One Agent's slot check, logged and traced as `haus.heartbeat.check`. */
export interface HeartbeatCheckRecord extends HeartbeatSlot {
    agentId: string;
    outcome: HeartbeatCheckOutcome;
    reason?: HeartbeatSkipReason;
}

/**
 * Sends each Agent one `agent-heartbeat-request` per due slot while this machine is
 * awake. The Server decides whether the run happens. The last sent slot persists in
 * `runtime/heartbeat-schedule.json`, so a restart never asks for the same slot twice.
 */
export function startHeartbeatSchedule(
    work: AttachmentConnectionWork,
    input: Omit<HeartbeatScheduleInput, 'handled'>
): void {
    const handled = new Map<string, string>();
    work.startLoop(
        heartbeatCheckInterval,
        async () => {
            await runHeartbeatSchedule({ ...input, handled });
        },
        (error) => {
            void reportHeartbeatCheckFailure(input.runtime, error);
        }
    );
}

/** One tick; returns the checks it finished. One Agent's failure never stops the rest. */
export async function runHeartbeatSchedule(
    input: HeartbeatScheduleInput
): Promise<HeartbeatCheckRecord[]> {
    const now = input.now?.() ?? new Date();
    const records: HeartbeatCheckRecord[] = [];
    for (const agentId of (await listAgentIds(input.agentsDir)).sort()) {
        const slot = dueHeartbeatSlot(agentId, now);
        if (!slot || input.handled.get(agentId) === slotKey(slot)) {
            continue;
        }
        try {
            const record = await checkAgent(input, agentId, slot);
            if (record) {
                input.handled.set(agentId, slotKey(slot));
                records.push(record);
                await reportHeartbeatCheck(input.runtime, record);
            }
        } catch (error) {
            await reportHeartbeatCheckFailure(input.runtime, asError(error));
        }
    }
    return records;
}

/** Null when the slot was already sent, or its request could not be sent (retried next tick). */
async function checkAgent(
    input: HeartbeatScheduleInput,
    agentId: string,
    slot: HeartbeatSlot
): Promise<HeartbeatCheckRecord | null> {
    const skipped = (reason: HeartbeatSkipReason): HeartbeatCheckRecord => ({
        ...slot,
        agentId,
        outcome: 'skipped',
        reason,
    });
    if (input.daemonWork.retiredAgents.has(agentId)) {
        return skipped('retired');
    }
    if (input.daemonWork.resettingAgents.has(agentId)) {
        return skipped('resetting');
    }
    const agentRoot = join(input.agentsDir, agentId);
    if (!(await readAppliedAgentConfiguration(agentRoot))) {
        return skipped('not-configured');
    }
    const statePath = scheduleStatePath(agentRoot);
    const sent = await readSentSlots(statePath);
    if (sent[slot.kind] === slotKey(slot)) {
        return null;
    }
    if (!input.daemonWork.send({ agentId, ...slot, type: 'agent-heartbeat-request' })) {
        await reportHeartbeatRequestFailure(input.runtime, { ...slot, agentId });
        return null;
    }
    await writeSentSlots(statePath, { ...sent, [slot.kind]: slotKey(slot) });
    return { ...slot, agentId, outcome: 'requested' };
}

type SentSlots = Partial<Record<HeartbeatSlot['kind'], string>>;

function scheduleStatePath(agentRoot: string): string {
    return join(agentRoot, 'runtime', 'heartbeat-schedule.json');
}

async function readSentSlots(path: string): Promise<SentSlots> {
    const raw = await readFile(path, 'utf8').catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        throw error;
    });
    if (raw === null) {
        return {};
    }
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return {
            ...(typeof parsed.daytime === 'string' ? { daytime: parsed.daytime } : {}),
            ...(typeof parsed.nightly === 'string' ? { nightly: parsed.nightly } : {}),
        };
    } catch {
        // A torn state file only risks one repeated request, which the Server dedupes.
        return {};
    }
}

async function writeSentSlots(path: string, sent: SentSlots): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.tmp`;
    await writeFile(temporary, `${JSON.stringify(sent)}\n`, { mode: 0o600 });
    await rename(temporary, path);
}

/** Agent folders only; dot-entries such as `.harness-bridge-prewarm` are Computer scratch. */
async function listAgentIds(agentsDir: string): Promise<string[]> {
    try {
        const entries = await readdir(agentsDir, { withFileTypes: true });
        return entries
            .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
            .map((entry) => entry.name);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

/** One local log line plus one `haus.heartbeat.check` span, which the telemetry export carries to Axiom. */
async function reportHeartbeatCheck(
    runtime: DaemonRuntime,
    record: HeartbeatCheckRecord
): Promise<void> {
    await runtime.runPromise(
        Effect.logInfo('Heartbeat check.').pipe(
            Effect.annotateLogs({ event: 'heartbeat.check', ...record }),
            withTelemetrySpan('haus.heartbeat.check', {
                'haus.agent.id': record.agentId,
                'haus.heartbeat.kind': record.kind,
                'haus.heartbeat.local_date': record.localDate,
                'haus.heartbeat.outcome': record.outcome,
                'haus.heartbeat.slot': record.slot,
                ...(record.reason ? { 'haus.heartbeat.skip_reason': record.reason } : {}),
            })
        )
    );
}

async function reportHeartbeatRequestFailure(
    runtime: DaemonRuntime,
    record: HeartbeatSlot & { agentId: string }
): Promise<void> {
    await runtime.runPromise(
        Effect.logWarning('Heartbeat request was not sent; the next tick retries.').pipe(
            Effect.annotateLogs({ event: 'heartbeat.request-failed', ...record })
        )
    );
}

async function reportHeartbeatCheckFailure(runtime: DaemonRuntime, error: Error): Promise<void> {
    await runtime.runPromise(
        Effect.logWarning('Heartbeat check skipped an Agent; the loop continues.').pipe(
            Effect.annotateLogs({
                errorCode: (error as NodeJS.ErrnoException).code ?? 'unknown',
                errorType: error.name,
                event: 'heartbeat-check-failed',
            })
        )
    );
}
