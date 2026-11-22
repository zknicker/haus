import {
    type DispatchKey,
    dispatchIdOf,
    type InvocationRequestFrame,
    type InvocationResultFrame,
    type InvokeCommand,
    type InvokeResult,
    invocationGraceMs,
    invokeAcceptedSchema,
    invokeResultSchema,
} from '@haus/api';
import { onAgentLifecycle } from '../agent-delivery/lifecycle.ts';
import { desktopResultAnswer, gateDesktopInvocation } from '../computer-use/computer-use-gate.ts';
import type { ComputerConnections } from '../computers/connections.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { RunnerLink } from '../runner/runner-link.ts';
import { clampTimeoutMs, noticeAnswer, settledAnswer } from './invocation-answers.ts';
import { type InvocationClock, systemInvocationClock } from './invocation-clock.ts';
import { bindRunnerUpload } from './invocation-payloads.ts';
import {
    readAgentMachine,
    recordAccepted,
    recordInvocation,
    recordOpenInvocationsUnknown,
    recordResult,
    recordSendFailure,
    recordUnknown,
} from './invocation-store.ts';
import {
    announceDesktopActivity,
    type OpenInvocation,
    resendGateInput,
    stopDesktopCommands,
    stoppedResult,
} from './open-invocations.ts';

export type InvocationRouter = ReturnType<typeof routeInvocations>;

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
    const stopSettleWatch = onAgentLifecycle((event) => {
        if (event.phase !== 'settled') {
            return;
        }
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
        const record = await recordUnknown(db, invocationId);
        if (record && invocation) {
            answer(
                noticeAnswer({ ...invocation.key, agentId: record.agentId }, 'unknown', record.id)
            );
        }
    }

    async function request(frame: InvocationRequestFrame) {
        const agent = await readAgentMachine(db, frame.agentId);
        if (!agent) {
            answer(noticeAnswer(frame, 'offline'));
            return;
        }
        const computerId = agent.computerId;
        const online = computerId !== null && computers.isOnline(computerId);
        const timeoutMs = clampTimeoutMs(frame.operation, frame.timeoutMs);
        const { created, record } = await recordInvocation(db, {
            computerId,
            frame,
            offline: !online,
            operationKind: frame.operation.kind,
            serverId: agent.serverId,
            timeoutMs,
        });
        if (!created) {
            if (record.state === 'finished' || record.state === 'unknown') {
                answer(settledAnswer(record));
            }
            return;
        }
        if (frame.operation.kind === 'file-write' && frame.operation.bytes.kind === 'attachment') {
            await bindRunnerUpload(db, record, frame.operation.bytes.attachmentId);
        }
        const refusal = computerId
            ? await gateDesktopInvocation(db, {
                  agentId: frame.agentId,
                  appOrigin,
                  computerId,
                  invocationId: record.id,
                  key: frame,
                  online,
                  operation: frame.operation,
                  serverId: agent.serverId,
              })
            : null;
        if (refusal) {
            answer(refusal);
            return;
        }
        if (!(online && computerId)) {
            answer(noticeAnswer(frame, 'offline', record.id));
            return;
        }
        const command: InvokeCommand = {
            agentId: frame.agentId,
            invocationId: record.id,
            operation: frame.operation,
            runId: frame.runId,
            timeoutMs,
            type: 'invoke',
        };
        const invocation: OpenInvocation = {
            accepted: false,
            cancelled: false,
            command,
            computerId,
            grace: armGrace(record.id, timeoutMs),
            key: { runId: frame.runId, seq: frame.seq, toolCallId: frame.toolCallId },
            runSettled: false,
            serverId: agent.serverId,
            stopped: false,
        };
        open.set(record.id, invocation);
        byDispatch.set(dispatchIdOf(frame), record.id);
        if (!computers.send(computerId, command)) {
            forget(record.id);
            await recordSendFailure(db, record.id);
            answer(noticeAnswer(frame, 'offline', record.id));
            return;
        }
        announceDesktopActivity(invocation);
    }

    function cancel(key: DispatchKey) {
        const invocationId = byDispatch.get(dispatchIdOf(key));
        const invocation = invocationId ? open.get(invocationId) : undefined;
        if (!(invocationId && invocation)) {
            return;
        }
        invocation.cancelled = true;
        computers.send(invocation.computerId, { invocationId, type: 'invoke-cancel' });
    }

    async function settle(computerId: string, result: InvokeResult) {
        const stopped = open.get(result.invocationId)?.stopped === true;
        const settlement = await recordResult(db, computerId, result);
        computers.send(computerId, {
            invocationId: result.invocationId,
            type: 'invoke-result-ack',
        });
        if (settlement.kind === 'finished') {
            forget(result.invocationId);
            answer(
                await desktopResultAnswer(db, {
                    appOrigin,
                    record: settlement.record,
                    result,
                    stopped,
                })
            );
        }
    }

    async function settleStopped(invocationId: string, invocation: OpenInvocation) {
        const result = stoppedResult(invocationId);
        const settlement = await recordResult(db, invocation.computerId, result);
        if (settlement.kind === 'finished') {
            forget(invocationId);
            answer(
                await desktopResultAnswer(db, {
                    appOrigin,
                    record: settlement.record,
                    result,
                    stopped: true,
                })
            );
        }
    }

    async function resend(invocationId: string, invocation: OpenInvocation) {
        const refusal = await gateDesktopInvocation(
            db,
            resendGateInput(appOrigin, invocationId, invocation)
        );
        if (!refusal) {
            if (open.get(invocationId) !== invocation || invocation.accepted) {
                return;
            }
            if (invocation.stopped) {
                await settleStopped(invocationId, invocation);
            } else if (!invocation.cancelled) {
                computers.send(invocation.computerId, invocation.command);
            }
            return;
        }
        forget(invocationId);
        computers.send(invocation.computerId, { invocationId, type: 'invoke-cancel' });
        answer(refusal);
    }

    return {
        cancel,
        close() {
            stopSettleWatch();
            for (const invocationId of [...open.keys()]) {
                forget(invocationId);
            }
        },
        computerAttached(computerId: string) {
            for (const [invocationId, invocation] of open) {
                if (invocation.computerId !== computerId) {
                    continue;
                }
                if (invocation.runSettled || invocation.cancelled) {
                    computers.send(computerId, { invocationId, type: 'invoke-cancel' });
                } else if (!invocation.accepted) {
                    void resend(invocationId, invocation).catch((error: unknown) =>
                        console.error('[haus] invocation resend failed', error)
                    );
                }
            }
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
