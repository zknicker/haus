import { randomUUID } from 'node:crypto';
import { access, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { AgentBackgroundWorkReport, AgentSubagentWakeRequest } from '@haus/api';
import { readAgentSessionState } from './harness/session-store.ts';
import type { BackgroundWork, BackgroundWorkListener } from './runtime/background-work.ts';

/** How long a self-started turn's `haus` calls wait for the wake run the Server dispatches. */
export const wakeHoldMs = 120_000;

/** Marks an Agent whose process ran background work, so a restart can say it was lost. */
const markerPath = (agentRoot: string) => join(agentRoot, 'runtime', 'background-work.json');

export interface BackgroundWorkReporterInput {
    /** This attachment's `servers/<serverId>/agents` partition. */
    agentsDir: string;
    /** The attachment daemon is shutting down: lost work is reported by the next start. */
    closing(): boolean;
    /** Holds the Agent's `haus` calls until the wake run's runner arrives. */
    holdForWake(agentId: string, ms: number): void;
    onError(error: unknown): void;
    send(frame: unknown): boolean;
}

export interface BackgroundWorkReporter extends BackgroundWorkListener {
    /** Once per daemon: asks a wake for every Agent whose background work a restart ended. */
    recoverLostWork(): Promise<void>;
    /** On each connect: every hosted Agent's live sub-agent count, zero for one with none. */
    reportCounts(): Promise<void>;
}

/**
 * The attachment daemon's side of background work (specs/runtime-drivers.md "Background
 * work"). A turn Claude Code starts on its own becomes a Server-owned wake run; work a process
 * took with it when it died (a crash, a failed turn, a restart) becomes a `stopped` wake so the
 * Agent can tell whoever was waiting. Work Haus ended on purpose (Stop, reset) wakes nobody.
 */
export function createBackgroundWorkReporter(
    input: BackgroundWorkReporterInput
): BackgroundWorkReporter {
    let recovered = false;
    const counts = new Map<string, number>();
    const report = (operation: Promise<unknown>) => void operation.catch(input.onError);
    const sendCounts = (agents: AgentBackgroundWorkReport['agents']) => {
        if (agents.length > 0) {
            input.send({
                agents,
                type: 'agent-background-work',
            } satisfies AgentBackgroundWorkReport);
        }
    };
    const count = (agentRoot: string, subagents: number) => {
        const agentId = basename(agentRoot);
        if ((counts.get(agentId) ?? 0) !== subagents) {
            counts.set(agentId, subagents);
            sendCounts([{ agentId, subagents }]);
        }
    };
    const requestWake = async (
        agentRoot: string,
        reason: AgentSubagentWakeRequest['reason']
    ): Promise<boolean> => {
        const session = await readAgentSessionState(agentRoot);
        if (!session) {
            return false;
        }
        const frame: AgentSubagentWakeRequest = {
            agentId: basename(agentRoot),
            reason,
            sessionGeneration: session.generation,
            type: 'agent-subagent-wake',
            wakeId: `wake_${randomUUID()}`,
        };
        return input.send(frame);
    };
    const reportStopped = async (agentRoot: string) => {
        if (await requestWake(agentRoot, 'stopped')) {
            await rm(markerPath(agentRoot), { force: true });
        }
    };
    return {
        changed(agentRoot: string, work: BackgroundWork) {
            count(agentRoot, work.subagents);
            report(writeMarker(agentRoot, work));
        },
        lost(agentRoot: string, deliberate: boolean) {
            count(agentRoot, 0);
            if (deliberate) {
                report(rm(markerPath(agentRoot), { force: true }));
            } else if (!input.closing()) {
                report(reportStopped(agentRoot));
            }
            // Closing: the marker stays, and the next start reports the lost work.
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
                    subagents: counts.get(agentId) ?? 0,
                }))
            );
        },
        wake(agentRoot: string) {
            input.holdForWake(basename(agentRoot), wakeHoldMs);
            report(requestWake(agentRoot, 'finished'));
        },
    };
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
