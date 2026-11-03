import { access, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { AgentBackgroundWorkReport, AgentSubagentWakeResult } from '@haus/api';
import { createKeyedQueue } from './keyed-queue.ts';
import type { BackgroundWork, BackgroundWorkListener } from './runtime/background-work.ts';
import { createSubagentWakeRequests } from './subagent-wake-requests.ts';

/** How long a self-started turn's `haus` calls wait for the wake run the Server dispatches. */
export const wakeHoldMs = 120_000;

/** Marks an Agent whose process ran background work, so a restart can say it was lost. */
const markerPath = (agentRoot: string) => join(agentRoot, 'runtime', 'background-work.json');

export interface BackgroundWorkReporterInput {
    /** This attachment's `servers/<serverId>/agents` partition. */
    agentsDir: string;
    /** The attachment daemon is shutting down: lost work is reported by the next start. */
    closing(): boolean;
    /** Interrupts the turn the runtime started on its own when the Server refused its wake. */
    fence(agentRoot: string): Promise<void>;
    /** Holds the Agent's `haus` calls until the wake run's runner arrives. */
    holdForWake(agentId: string, ms: number): void;
    onError(error: unknown): void;
    send(frame: unknown): boolean;
}

export interface BackgroundWorkReporter extends BackgroundWorkListener {
    /** The Server's answer to one wake request. */
    onWakeResult(result: AgentSubagentWakeResult): void;
    /** Once per daemon: asks a wake for every Agent whose background work a restart ended. */
    recoverLostWork(): Promise<void>;
    /** On each connect: every hosted Agent's live sub-agent count, zero for one with none. */
    reportCounts(): Promise<void>;
    /** On each connect: every wake still owed an answer, sent again. */
    resendPendingWakes(): Promise<void>;
}

/**
 * The attachment daemon's side of background work (specs/runtime-drivers.md "Background
 * work"). A turn Claude Code starts on its own becomes a Server-owned wake run; work a process
 * took with it when it died (a crash, a failed turn, a restart) becomes a `stopped` wake so the
 * Agent can tell whoever was waiting. Work Haus ended on purpose (Stop, reset, Restart) wakes
 * nobody. Each Agent's files change on one queue, in call order.
 */
export function createBackgroundWorkReporter(
    input: BackgroundWorkReporterInput
): BackgroundWorkReporter {
    let recovered = false;
    const counts = new Map<string, BackgroundWork>();
    const queue = createKeyedQueue(input.onError);
    const wakes = createSubagentWakeRequests({ fence: input.fence, queue, send: input.send });
    const sendCounts = (agents: AgentBackgroundWorkReport['agents']) => {
        if (agents.length > 0) {
            input.send({
                agents,
                type: 'agent-background-work',
            } satisfies AgentBackgroundWorkReport);
        }
    };
    // Sub-agents show as Agent activity; any task holds the Agent's heartbeats and dreams.
    const count = (agentRoot: string, work: BackgroundWork) => {
        const agentId = basename(agentRoot);
        const last = counts.get(agentId) ?? idleWork;
        if (last.subagents !== work.subagents || last.tasks !== work.tasks) {
            counts.set(agentId, work);
            sendCounts([{ agentId, ...reported(work) }]);
        }
    };
    const clearMarker = (agentRoot: string) =>
        queue.run(agentRoot, () => rm(markerPath(agentRoot), { force: true }));
    const reportStopped = (agentRoot: string) =>
        Promise.all([wakes.request(agentRoot, 'stopped'), clearMarker(agentRoot)]);
    return {
        absorbed(agentRoot: string) {
            void wakes.absorbed(agentRoot);
        },
        changed(agentRoot: string, work: BackgroundWork) {
            count(agentRoot, work);
            void queue.run(agentRoot, () => writeMarker(agentRoot, work));
        },
        lost(agentRoot: string, deliberate: boolean) {
            count(agentRoot, idleWork);
            if (deliberate) {
                void clearMarker(agentRoot);
            } else if (!input.closing()) {
                void reportStopped(agentRoot);
            }
            // Closing: the marker stays, and the next start reports the lost work.
        },
        onWakeResult(result: AgentSubagentWakeResult) {
            void wakes.answered(join(input.agentsDir, result.agentId), result);
        },
        async recoverLostWork() {
            if (recovered) {
                return;
            }
            recovered = true;
            for (const agentRoot of await listAgentRoots(input.agentsDir)) {
                if (await exists(markerPath(agentRoot))) {
                    await reportStopped(agentRoot);
                }
            }
        },
        async reportCounts() {
            const agents = (await listAgentRoots(input.agentsDir)).map((root) => basename(root));
            sendCounts(
                agents.slice(0, 500).map((agentId) => ({
                    agentId,
                    ...reported(counts.get(agentId) ?? idleWork),
                }))
            );
        },
        async resendPendingWakes() {
            const roots = await listAgentRoots(input.agentsDir);
            await Promise.all(roots.map((agentRoot) => wakes.resend(agentRoot)));
        },
        async retire(agentRoot: string) {
            await Promise.all([wakes.retire(agentRoot), clearMarker(agentRoot)]);
        },
        settled: (agentRoot: string) => queue.settled(agentRoot),
        wake(agentRoot: string) {
            input.holdForWake(basename(agentRoot), wakeHoldMs);
            void wakes.request(agentRoot, 'finished');
        },
    };
}

const idleWork: BackgroundWork = { subagents: 0, tasks: 0 };

/** The wire counts, clamped to the report's bounds; a clamped count still reads as live. */
function reported(work: BackgroundWork): { subagents: number; tasks: number } {
    return { subagents: Math.min(work.subagents, 64), tasks: Math.min(work.tasks, 1000) };
}

async function writeMarker(agentRoot: string, work: BackgroundWork): Promise<void> {
    if (work.tasks === 0) {
        await rm(markerPath(agentRoot), { force: true });
        return;
    }
    await mkdir(join(agentRoot, 'runtime'), { mode: 0o700, recursive: true });
    await writeFile(markerPath(agentRoot), JSON.stringify(work), { mode: 0o600 });
}

async function listAgentRoots(agentsDir: string): Promise<string[]> {
    try {
        const entries = await readdir(agentsDir, { withFileTypes: true });
        return entries
            .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
            .map((entry) => join(agentsDir, entry.name));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

async function exists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return false;
        }
        throw error;
    }
}
