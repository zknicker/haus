import {
    type DispatchKey,
    dispatchIdOf,
    type InvocationRequestFrame,
    type InvocationResultFrame,
    type InvokeCommand,
    type InvokeResult,
    invokeAcceptedSchema,
    invokeResultSchema,
} from '@haus/api';
import { onAgentLifecycle } from '../agent-delivery/lifecycle.ts';
import type { ComputerConnections } from '../computers/connections.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { RunnerLink } from '../runner/runner-link.ts';
import { clampTimeoutMs, noticeAnswer, resultAnswer, settledAnswer } from './invocation-answers.ts';
import {
    type InvocationClock,
    invocationGraceMs,
    systemInvocationClock,
} from './invocation-clock.ts';
import {
    readAgentMachine,
    recordAccepted,
    recordInvocation,
    recordOpenInvocationsUnknown,
    recordResult,
    recordSendFailure,
    recordUnknown,
} from './invocation-store.ts';

export type InvocationRouter = ReturnType<typeof routeInvocations>;

interface RouterInput {
    clock: InvocationClock;
    computers: Pick<ComputerConnections, 'isOnline' | 'send'>;
    db: HausDatabase;
    runner: Pick<RunnerLink, 'send'>;
}

interface OpenInvocation {
    accepted: boolean;
    cancelled: boolean;
    command: InvokeCommand;
    computerId: string;
    grace: { cancel(): void } | null;
    key: DispatchKey;
    runSettled: boolean;
}

export async function openInvocationRouter(
    input: Omit<RouterInput, 'clock'> & { clock: InvocationClock | undefined }
) {
    await recordOpenInvocationsUnknown(input.db);
    return routeInvocations({ ...input, clock: input.clock ?? systemInvocationClock });
}

function routeInvocations(input: RouterInput) {
    const { clock, computers, db } = input;
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
        invocation?.grace?.cancel();
        open.delete(invocationId);
        if (invocation) {
            byDispatch.delete(dispatchIdOf(invocation.key));
        }
    }

    function armGrace(invocationId: string, invocation: OpenInvocation) {
        invocation.grace ??= clock.schedule(() => {
            void expire(invocationId).catch((error: unknown) =>
                console.error('[haus] invocation grace failed', error)
            );
        }, invocation.command.timeoutMs + invocationGraceMs);
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
        open.set(record.id, {
            accepted: false,
            cancelled: false,
            command,
            computerId,
            grace: null,
            key: { runId: frame.runId, seq: frame.seq, toolCallId: frame.toolCallId },
            runSettled: false,
        });
        byDispatch.set(dispatchIdOf(frame), record.id);
        if (!computers.send(computerId, command)) {
            forget(record.id);
            await recordSendFailure(db, record.id);
            answer(noticeAnswer(frame, 'offline', record.id));
        }
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
        const settlement = await recordResult(db, computerId, result);
        computers.send(computerId, {
            invocationId: result.invocationId,
            type: 'invoke-result-ack',
        });
        if (settlement.kind === 'finished') {
            forget(result.invocationId);
            answer(resultAnswer(settlement.record, result));
        }
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
                    if (invocation.accepted) {
                        invocation.grace?.cancel();
                        invocation.grace = null;
                    }
                    continue;
                }
                if (invocation.accepted || computers.send(computerId, invocation.command)) {
                    invocation.grace?.cancel();
                    invocation.grace = null;
                }
            }
        },
        computerDetached(computerId: string) {
            for (const [invocationId, invocation] of open) {
                if (invocation.computerId === computerId) {
                    armGrace(invocationId, invocation);
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
