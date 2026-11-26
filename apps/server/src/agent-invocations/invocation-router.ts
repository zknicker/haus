import {
    type DispatchKey,
    dispatchIdOf,
    type InvocationResultFrame,
    type InvokeResult,
    invocationGraceMs,
    invokeAcceptedSchema,
    invokeResultSchema,
} from '@haus/api';
import { onAgentLifecycle } from '../agent-delivery/lifecycle.ts';
import type { ComputerConnections } from '../computers/connections.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { RunnerLink } from '../runner/runner-link.ts';
import { createDesktopLeases } from './desktop-lease.ts';
import { createFenceEpochs } from './fence-epochs.ts';
import { machineResultAnswer, settledAnswer } from './invocation-answers.ts';
import { type InvocationClock, systemInvocationClock } from './invocation-clock.ts';
import { noticeAnswer } from './invocation-frames.ts';
import { reattachInvocations } from './invocation-reattach.ts';
import { createInvocationRequests } from './invocation-request.ts';
import {
    recordAccepted,
    recordOpenInvocationsUnknown,
    recordResult,
    recordSentRefusal,
    recordUnknown,
} from './invocation-store.ts';
import {
    announceDesktopActivity,
    dropUnstarted,
    type OpenInvocation,
    stopDesktopCommands,
    stoppedResult,
} from './open-invocations.ts';

export type InvocationRouter = ReturnType<typeof routeInvocations>;

interface SessionArchiveTarget {
    agentId: string;
    computerId: string;
    generation: number;
    serverId: string;
}

interface RouterInput {
    appOrigin: string;
    clock: InvocationClock;
    computers: Pick<ComputerConnections, 'isOnline' | 'send'>;
    db: HausDatabase;
    runner: Pick<RunnerLink, 'send'>;
}

export async function openInvocationRouter(
    input: Omit<RouterInput, 'clock'> & { clock: InvocationClock | undefined }
) {
    await recordOpenInvocationsUnknown(input.db);
    return routeInvocations({ ...input, clock: input.clock ?? systemInvocationClock });
}

function routeInvocations(input: RouterInput) {
    const { appOrigin, clock, computers, db } = input;
    const open = new Map<string, OpenInvocation>();
    const byDispatch = new Map<string, string>();
    const undelivered = new Map<string, InvocationResultFrame>();
    const fenceEpochs = createFenceEpochs();
    const desktopLeases = createDesktopLeases(clock);
    const stopSettleWatch = onAgentLifecycle((event) => {
        if (event.phase !== 'settled') {
            return;
        }
        desktopLeases.releaseRun(event.runId);
        for (const invocation of open.values()) {
            if (invocation.key.runId === event.runId) {
                invocation.runSettled = true;
            }
        }
    });

    function answer(frame: InvocationResultFrame) {
        if (!input.runner.send(frame)) {
            undelivered.set(dispatchIdOf(frame), frame);
        }
    }

    function forget(invocationId: string) {
        const invocation = open.get(invocationId);
        invocation?.grace.cancel();
        open.delete(invocationId);
        if (invocation) {
            byDispatch.delete(dispatchIdOf(invocation.key));
            announceDesktopActivity(invocation);
            desktopLeases.refresh(invocation, {
                agentId: invocation.command.agentId,
                runId: invocation.key.runId,
            });
        }
    }

    function armGrace(invocationId: string, timeoutMs: number) {
        return clock.schedule(() => {
            void expire(invocationId).catch((error: unknown) =>
                console.error('[haus] invocation grace failed', error)
            );
        }, timeoutMs + invocationGraceMs);
    }

    async function expire(invocationId: string) {
        const invocation = open.get(invocationId);
        forget(invocationId);
        dropUnstarted(computers, invocationId, invocation);
        const record = await recordUnknown(db, invocationId);
        if (record && invocation) {
            answer(
                noticeAnswer({ ...invocation.key, agentId: record.agentId }, 'unknown', record.id)
            );
        }
    }

    const request = createInvocationRequests({
        answer,
        appOrigin,
        armGrace,
        byDispatch,
        computers,
        db,
        desktopLeases,
        fenceEpochs,
        forget,
        open,
    });

    function cancel(key: DispatchKey) {
        const invocationId = byDispatch.get(dispatchIdOf(key));
        const invocation = invocationId ? open.get(invocationId) : undefined;
        if (!(invocationId && invocation)) {
            return;
        }
        invocation.cancelled = true;
        computers.send(invocation.computerId, { invocationId, type: 'invoke-cancel' });
    }

    async function settle(computerId: string, result: InvokeResult, local?: OpenInvocation) {
        const invocation = local ?? open.get(result.invocationId);
        const settlement = await recordResult(db, computerId, result);
        if (!local) {
            computers.send(computerId, {
                invocationId: result.invocationId,
                type: 'invoke-result-ack',
            });
        }
        if (settlement.kind === 'finished') {
            forget(result.invocationId);
            answer(
                await machineResultAnswer(db, {
                    appOrigin,
                    fenced: invocation?.fenced === true,
                    homeComputerId: invocation ? invocation.homeComputerId : undefined,
                    record: settlement.record,
                    result,
                    stopped: invocation?.stopped === true,
                })
            );
        }
    }

    async function settleUnsent(invocationId: string, invocation: OpenInvocation) {
        if (!invocation.fenced) {
            await settle(invocation.computerId, stoppedResult(invocationId), invocation);
            return;
        }
        forget(invocationId);
        const record = await recordSentRefusal(db, invocationId, 'no-access');
        if (record) {
            answer(await settledAnswer(db, { appOrigin, record }));
        }
    }

    const { fence, fenceHeld, reattach } = reattachInvocations({
        answer,
        appOrigin,
        computers,
        db,
        forget,
        open,
        settleUnsent,
    });

    return {
        cancel,
        close() {
            stopSettleWatch();
            desktopLeases.close();
            for (const invocationId of [...open.keys()]) {
                forget(invocationId);
            }
        },
        computerAttached(computerId: string) {
            void reattach(computerId).catch((error: unknown) =>
                console.error('[haus] invocation reattach failed', error)
            );
        },
        computerAttaching: fenceHeld,
        fenceAgent(target: { agentId: string; computerId: string; serverId: string }) {
            fenceEpochs.bump(target);
            desktopLeases.releaseAgent(target.agentId, target);
            return fence(target);
        },
        archiveSession(target: SessionArchiveTarget) {
            desktopLeases.releaseAgent(target.agentId);
            computers.send(target.computerId, {
                agentId: target.agentId,
                generation: target.generation,
                type: 'task-archive',
            });
        },
        async ingestComputerFrame(computerId: string, frame: unknown) {
            const accepted = invokeAcceptedSchema.safeParse(frame);
            if (accepted.success) {
                const invocation = open.get(accepted.data.invocationId);
                if (invocation?.computerId === computerId) {
                    invocation.accepted = true;
                }
                await recordAccepted(db, accepted.data.invocationId, computerId);
                return true;
            }
            const result = invokeResultSchema.safeParse(frame);
            if (result.success) {
                await settle(computerId, result.data);
                return true;
            }
            return false;
        },
        request,
        stopDesktop: (target: { computerId: string; serverId: string }) =>
            stopDesktopCommands(open, computers, target),
        runnerAttached() {
            for (const [dispatchId, frame] of undelivered) {
                if (!input.runner.send(frame)) {
                    return;
                }
                undelivered.delete(dispatchId);
            }
        },
    };
}
