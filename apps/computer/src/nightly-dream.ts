import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
    asError,
    type DreamCheckOutcome,
    type DreamSkipReason,
    withTelemetrySpan,
} from '@haus/effect';
import { Effect } from 'effect';
import { readAppliedAgentConfiguration } from './agent-configuration.ts';
import type { AttachmentConnectionWork } from './attachment-connection-work.ts';
import type { AttachmentDaemonWork } from './attachment-daemon-work.ts';
import type { DaemonRuntime } from './daemon-runtime.ts';
import { checkDream, markDreamChecked } from './harness/memory-dream.ts';

/** The quiet window, in this machine's local time: the night's check runs from 03:00 until 05:00. */
export const dreamWindow = { endHour: 5, startHour: 3 } as const;
/** How often the timer looks for the window; each Agent is still checked once per night. */
export const dreamCheckInterval = '10 minutes';

export interface NightlyDreamInput {
    /** This attachment's `servers/<serverId>/agents` partition. */
    agentsDir: string;
    /** Agents whose check this process already finished, by local date, including skips. */
    checked: Map<string, string>;
    daemonWork: Pick<AttachmentDaemonWork, 'resettingAgents' | 'retiredAgents' | 'send'>;
    now?: () => Date;
    runtime: DaemonRuntime;
}

/** One Agent's nightly check, logged and traced as `haus.dream.check`. */
export interface DreamCheckRecord {
    agentId: string;
    localDate: string;
    memoryBytes: number | null;
    outcome: DreamCheckOutcome;
    reason?: DreamSkipReason;
}

/**
 * Checks each Agent once per Computer-local night, at the first tick inside the
 * quiet window while this machine is awake; a night the machine sleeps through is
 * skipped. A due Agent's request goes to the Server, which queues the dream even
 * behind other work. The checked date persists in `runtime/memory-dream.json`, so a
 * restart never checks the same night twice.
 */
export function startNightlyDreamCheck(
    work: AttachmentConnectionWork,
    input: Omit<NightlyDreamInput, 'checked'>
): void {
    const checked = new Map<string, string>();
    work.startLoop(
        dreamCheckInterval,
        async () => {
            await runNightlyDreamCheck({ ...input, checked });
        },
        (error) => {
            void reportDreamCheckFailure(input.runtime, error);
        }
    );
}

/** One tick; returns the checks it finished. One Agent's failure never stops the rest. */
export async function runNightlyDreamCheck(input: NightlyDreamInput): Promise<DreamCheckRecord[]> {
    const now = input.now?.() ?? new Date();
    if (!isInDreamWindow(now)) {
        return [];
    }
    const localDate = localDateOf(now);
    const records: DreamCheckRecord[] = [];
    for (const agentId of (await listAgentIds(input.agentsDir)).sort()) {
        if (input.checked.get(agentId) === localDate) {
            continue;
        }
        try {
            const record = await checkAgent(input, { agentId, localDate, now });
            if (record) {
                input.checked.set(agentId, localDate);
                records.push(record);
                await reportDreamCheck(input.runtime, record);
            }
        } catch (error) {
            await reportDreamCheckFailure(input.runtime, asError(error));
        }
    }
    return records;
}

export function isInDreamWindow(now: Date): boolean {
    const hour = now.getHours();
    return hour >= dreamWindow.startHour && hour < dreamWindow.endHour;
}

/** Null when the night is already checked, or its request could not be sent (retried next tick). */
async function checkAgent(
    input: NightlyDreamInput,
    night: { agentId: string; localDate: string; now: Date }
): Promise<DreamCheckRecord | null> {
    const { agentId, localDate } = night;
    const skipped = (reason: DreamSkipReason): DreamCheckRecord => ({
        agentId,
        localDate,
        memoryBytes: null,
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
    const check = await checkDream({
        agentRoot,
        localDate,
        now: night.now.getTime(),
        workspaceDir: join(agentRoot, 'workspace'),
    });
    const record = { agentId, localDate, memoryBytes: check.memoryBytes };
    switch (check.verdict) {
        case 'already-checked':
            return null;
        case 'baselined':
        case 'not-due':
            return { ...record, outcome: check.verdict };
        case 'due':
            if (!input.daemonWork.send({ agentId, localDate, type: 'agent-dream-request' })) {
                await reportDreamRequestFailure(input.runtime, record);
                return null;
            }
            await markDreamChecked(agentRoot, localDate);
            return { ...record, outcome: 'requested' };
        default:
            return check.verdict satisfies never;
    }
}

/** The machine-local calendar date, the Server's once-per-night dedupe key. */
function localDateOf(now: Date): string {
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
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

/** One local log line plus one `haus.dream.check` span, which the telemetry export carries to Axiom. */
async function reportDreamCheck(runtime: DaemonRuntime, record: DreamCheckRecord): Promise<void> {
    await runtime.runPromise(
        Effect.logInfo('Nightly dream check.').pipe(
            Effect.annotateLogs({ event: 'nightly-dream.check', ...record }),
            withTelemetrySpan('haus.dream.check', {
                'haus.agent.id': record.agentId,
                'haus.dream.local_date': record.localDate,
                'haus.dream.outcome': record.outcome,
                ...(record.reason ? { 'haus.dream.skip_reason': record.reason } : {}),
                ...(record.memoryBytes === null ? {} : { 'haus.memory.bytes': record.memoryBytes }),
            })
        )
    );
}

async function reportDreamRequestFailure(
    runtime: DaemonRuntime,
    record: Omit<DreamCheckRecord, 'outcome'>
): Promise<void> {
    await runtime.runPromise(
        Effect.logWarning('Nightly dream request was not sent; the next tick retries.').pipe(
            Effect.annotateLogs({ event: 'nightly-dream.request-failed', ...record })
        )
    );
}

async function reportDreamCheckFailure(runtime: DaemonRuntime, error: Error): Promise<void> {
    await runtime.runPromise(
        Effect.logWarning('Nightly dream check skipped an Agent; the loop continues.').pipe(
            Effect.annotateLogs({
                errorCode: (error as NodeJS.ErrnoException).code ?? 'unknown',
                errorType: error.name,
                event: 'nightly-dream-check-failed',
            })
        )
    );
}
