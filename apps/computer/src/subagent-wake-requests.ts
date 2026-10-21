import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type {
    AgentSubagentWakeRequest,
    AgentSubagentWakeResult,
    AgentSubagentWakeRetire,
} from '@haus/api';
import { readAgentSessionState } from './harness/session-store.ts';
import type { KeyedQueue } from './keyed-queue.ts';

/** The one wake an Agent still owes the Server an answer for; resent until it gets one. */
const pendingPath = (agentRoot: string) => join(agentRoot, 'runtime', 'subagent-wake.json');

type WakeReason = AgentSubagentWakeRequest['reason'];

export interface SubagentWakeRequestsInput {
    /** Interrupts the turn the runtime started on its own when the Server refused its wake. */
    fence(agentRoot: string): Promise<void>;
    queue: KeyedQueue;
    send(frame: unknown): boolean;
}

/**
 * The Computer's half of the sub-agent wake handshake (specs/runtime-drivers.md "Background
 * work"). Each request is persisted before it is sent and resent on every connect until the
 * Server answers it, or until Haus retires it on purpose (Stop, reset, a run that adopted the
 * turn). Every file operation runs on the Agent's queue, in call order.
 */
export function createSubagentWakeRequests(input: SubagentWakeRequestsInput) {
    const { queue } = input;
    /** The wake asked for the self-started turn each Agent's runtime is running now. */
    const announced = new Map<string, string>();
    const send = (agentRoot: string, wake: PendingWake) =>
        input.send({
            agentId: basename(agentRoot),
            ...wake,
            type: 'agent-subagent-wake',
        } satisfies AgentSubagentWakeRequest);
    return {
        /** Asks the Server for a wake; `finished` wakes are for the turn now running. */
        request(agentRoot: string, reason: WakeReason): Promise<void> {
            const wakeId = `wake_${randomUUID()}`;
            if (reason === 'finished') {
                announced.set(basename(agentRoot), wakeId);
            }
            return queue.run(agentRoot, async () => {
                const session = await readAgentSessionState(agentRoot);
                if (!session) {
                    return;
                }
                const wake = { reason, sessionGeneration: session.generation, wakeId };
                await writePending(agentRoot, wake);
                send(agentRoot, wake);
            });
        },
        /** Resends the wake an Agent still owes an answer for (every connect). */
        resend(agentRoot: string): Promise<void> {
            return queue.run(agentRoot, async () => {
                const wake = await readPending(agentRoot);
                if (wake) {
                    send(agentRoot, wake);
                }
            });
        },
        answered(agentRoot: string, result: AgentSubagentWakeResult): Promise<void> {
            const agentId = basename(agentRoot);
            // Only a refusal of the wake for the turn still running fences anything.
            const fence = result.outcome === 'refused' && announced.get(agentId) === result.wakeId;
            if (fence) {
                announced.delete(agentId);
            }
            return queue.run(agentRoot, async () => {
                if ((await readPending(agentRoot))?.wakeId === result.wakeId) {
                    await rm(pendingPath(agentRoot), { force: true });
                }
                if (fence) {
                    await input.fence(agentRoot);
                }
            });
        },
        /** A non-wake run adopted the running self-started turn: its wake is moot. */
        absorbed(agentRoot: string): Promise<void> {
            const agentId = basename(agentRoot);
            const wakeId = announced.get(agentId);
            announced.delete(agentId);
            if (!wakeId) {
                return Promise.resolve();
            }
            return queue.run(agentRoot, async () => {
                if ((await readPending(agentRoot))?.wakeId === wakeId) {
                    await rm(pendingPath(agentRoot), { force: true });
                }
                // Best effort: a lost retire costs one wake turn that finds nothing to report.
                input.send({
                    agentId,
                    type: 'agent-subagent-wake-retire',
                    wakeId,
                } satisfies AgentSubagentWakeRetire);
            });
        },
        /** Haus ended the work on purpose: no wake is owed any more. */
        retire(agentRoot: string): Promise<void> {
            announced.delete(basename(agentRoot));
            return queue.run(agentRoot, () => rm(pendingPath(agentRoot), { force: true }));
        },
    };
}

interface PendingWake {
    reason: WakeReason;
    sessionGeneration: number;
    wakeId: string;
}

async function writePending(agentRoot: string, wake: PendingWake): Promise<void> {
    await mkdir(join(agentRoot, 'runtime'), { mode: 0o700, recursive: true });
    await writeFile(pendingPath(agentRoot), JSON.stringify(wake), { mode: 0o600 });
}

async function readPending(agentRoot: string): Promise<PendingWake | null> {
    let raw: string;
    try {
        raw = await readFile(pendingPath(agentRoot), 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        throw error;
    }
    const value = JSON.parse(raw) as Partial<PendingWake>;
    if (
        (value.reason === 'finished' || value.reason === 'stopped') &&
        typeof value.sessionGeneration === 'number' &&
        typeof value.wakeId === 'string'
    ) {
        return {
            reason: value.reason,
            sessionGeneration: value.sessionGeneration,
            wakeId: value.wakeId,
        };
    }
    // Unreadable forever otherwise: drop it, and report why.
    await rm(pendingPath(agentRoot), { force: true });
    throw new Error('The pending sub-agent wake record was malformed and is dropped.');
}
