import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { asError } from '@haus/effect';
import { Effect } from 'effect';
import { readAppliedAgentConfiguration } from './agent-configuration.ts';
import type { AttachmentConnectionWork } from './attachment-connection-work.ts';
import type { AttachmentDaemonWork } from './attachment-daemon-work.ts';
import type { DaemonRuntime } from './daemon-runtime.ts';
import { isDreamDue } from './harness/memory-dream.ts';

/** The quiet window, in this machine's local time: dreams start from 03:00 until 05:00. */
export const dreamWindow = { endHour: 5, startHour: 3 } as const;
/** How often the window is checked; a declined or busy Agent is retried on the next tick. */
export const dreamCheckInterval = '10 minutes';

export interface NightlyDreamInput {
    /** This attachment's `servers/<serverId>/agents` partition. */
    agentsDir: string;
    daemonWork: Pick<
        AttachmentDaemonWork,
        'agentWork' | 'resettingAgents' | 'retiredAgents' | 'send'
    >;
    now?: () => Date;
    runtime: DaemonRuntime;
}

/**
 * Asks the Server for one private dream turn per idle Agent whose memory changed,
 * during the quiet window, on the attachment's own loop. The Server decides: it
 * declines a stopped, busy, paused, or waiting Agent, so this only proposes.
 */
export function startNightlyDreamCheck(
    work: AttachmentConnectionWork,
    input: NightlyDreamInput
): void {
    work.startLoop(
        dreamCheckInterval,
        async () => {
            await runNightlyDreamCheck(input);
        },
        (error) => {
            void reportDreamCheckFailure(input.runtime, error);
        }
    );
}

/** One check; returns the Agents it asked to dream. One Agent's failure never stops the rest. */
export async function runNightlyDreamCheck(input: NightlyDreamInput): Promise<string[]> {
    const now = input.now?.() ?? new Date();
    if (!isInDreamWindow(now)) {
        return [];
    }
    const { daemonWork } = input;
    const requested: string[] = [];
    for (const agentId of (await listAgentIds(input.agentsDir)).sort()) {
        // A live run here, a reset, or a retirement: never interrupt; retry next tick.
        if (
            daemonWork.agentWork.activeRunId(agentId) ||
            daemonWork.resettingAgents.has(agentId) ||
            daemonWork.retiredAgents.has(agentId)
        ) {
            continue;
        }
        try {
            const agentRoot = join(input.agentsDir, agentId);
            if (!(await readAppliedAgentConfiguration(agentRoot))) {
                continue;
            }
            const due = await isDreamDue({
                agentRoot,
                now: now.getTime(),
                workspaceDir: join(agentRoot, 'workspace'),
            });
            if (
                due &&
                daemonWork.send({
                    agentId,
                    localDate: localDateOf(now),
                    type: 'agent-dream-request',
                })
            ) {
                requested.push(agentId);
            }
        } catch (error) {
            await reportDreamCheckFailure(input.runtime, asError(error));
        }
    }
    return requested;
}

export function isInDreamWindow(now: Date): boolean {
    const hour = now.getHours();
    return hour >= dreamWindow.startHour && hour < dreamWindow.endHour;
}

/** The machine-local calendar date, the Server's once-per-night dedupe key. */
function localDateOf(now: Date): string {
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
}

async function listAgentIds(agentsDir: string): Promise<string[]> {
    try {
        return await readdir(agentsDir);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return [];
        }
        throw error;
    }
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
