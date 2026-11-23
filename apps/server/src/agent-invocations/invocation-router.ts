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
import { isAgentAllowedOn } from '../computer-access/agent-access.ts';
import type { ComputerConnections } from '../computers/connections.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { RunnerLink } from '../runner/runner-link.ts';
import { machineResultAnswer, offlineAnswer, settledAnswer } from './invocation-answers.ts';
import { type InvocationClock, systemInvocationClock } from './invocation-clock.ts';
import { clampTimeoutMs, noticeAnswer } from './invocation-frames.ts';
import { decideInvocation } from './invocation-gate.ts';
import { bindRunnerUpload } from './invocation-payloads.ts';
import { reattachInvocations } from './invocation-reattach.ts';
import {
    readAgentMachine,
    recordAccepted,
    recordInvocation,
    recordOpenInvocationsUnknown,
    recordResult,
    recordSendFailure,
    recordSentRefusal,
    recordUnknown,
} from './invocation-store.ts';
import {
    announceDesktopActivity,
    type OpenInvocation,
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
        const requestedAt = new Date();
        const decision = await decideInvocation(db, {
            frame,
            home: agent.computerId,
            isOnline: (computerId) => computers.isOnline(computerId),
            serverId: agent.serverId,
        });
        const timeoutMs = clampTimeoutMs(frame.operation, frame.timeoutMs);
        const { created, record } = await recordInvocation(db, {
            computerId: decision.computerId,
            frame,
            requestedAt,
            serverId: agent.serverId,
            timeoutMs,
            verdict: decision.verdict,
        });
        if (!created) {
            if (record.state === 'finished' || record.state === 'unknown') {
                answer(await settledAnswer(db, { appOrigin, record }));
            }
            return;
        }
        if (frame.operation.kind === 'file-write' && frame.operation.bytes.kind === 'attachment') {
            await bindRunnerUpload(db, record, frame.operation.bytes.attachmentId);
        }
        const { computerId } = decision;
        if (decision.verdict.kind !== 'send' || computerId === null) {
            answer(await settledAnswer(db, { appOrigin, candidates: decision.candidates, record }));
            return;
        }
        const target = { agentId: frame.agentId, computerId, serverId: agent.serverId };
        if (!(await isAgentAllowedOn(db, target))) {
            const refused = await recordSentRefusal(db, record.id, 'no-access');
            answer(await settledAnswer(db, { appOrigin, record: refused ?? record }));
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
            fenced: false,
            grace: armGrace(record.id, timeoutMs),
            homeComputerId: agent.computerId,
            key: { runId: frame.runId, seq: frame.seq, toolCallId: frame.toolCallId },
            runSettled: false,
            serverId: agent.serverId,
            stopped: false,
        };
        open.set(record.id, invocation);
        byDispatch.set(dispatchIdOf(frame), record.id);
        if (!computers.send(computerId, command)) {
            forget(record.id);
            const failed = await recordSendFailure(db, record.id);
            answer(failed ? await offlineAnswer(db, failed) : noticeAnswer(frame, 'offline'));
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

    const { fence, reattach } = reattachInvocations({
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
            for (const invocationId of [...open.keys()]) {
                forget(invocationId);
            }
        },
        computerAttached(computerId: string) {
            void reattach(computerId).catch((error: unknown) =>
                console.error('[haus] invocation reattach failed', error)
            );
        },
        fenceAgent: fence,
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
