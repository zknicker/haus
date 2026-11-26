import { dispatchIdOf, type InvocationRequestFrame, type InvocationResultFrame } from '@haus/api';
import type { ComputerConnections } from '../computers/connections.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { DesktopLeases } from './desktop-lease.ts';
import type { createFenceEpochs } from './fence-epochs.ts';
import { offlineAnswer, settledAnswer } from './invocation-answers.ts';
import { leaseDesktop } from './invocation-desktop.ts';
import { clampTimeoutMs, invokeCommand, noticeAnswer } from './invocation-frames.ts';
import { decideInvocation } from './invocation-gate.ts';
import { bindRunnerUpload } from './invocation-payloads.ts';
import { gateSend } from './invocation-send-gate.ts';
import { readAgentMachine, recordInvocation, recordSendFailure } from './invocation-store.ts';
import { announceDesktopActivity, type OpenInvocation } from './open-invocations.ts';

export function createInvocationRequests(deps: {
    answer(frame: InvocationResultFrame): void;
    appOrigin: string;
    armGrace(invocationId: string, timeoutMs: number): { cancel(): void };
    byDispatch: Map<string, string>;
    computers: Pick<ComputerConnections, 'isOnline' | 'send'>;
    db: HausDatabase;
    desktopLeases: DesktopLeases;
    fenceEpochs: ReturnType<typeof createFenceEpochs>;
    forget(invocationId: string): void;
    open: Map<string, OpenInvocation>;
}) {
    const {
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
    } = deps;
    return async function request(frame: InvocationRequestFrame) {
        const agent = await readAgentMachine(db, frame.agentId);
        if (!agent) {
            answer(noticeAnswer(frame, 'offline'));
            return;
        }
        const requestedAt = new Date();
        const decision = await leaseDesktop(db, desktopLeases, {
            decision: await decideInvocation(db, {
                frame,
                home: agent.computerId,
                isOnline: (computerId) => computers.isOnline(computerId),
                placementGeneration: agent.placementGeneration,
                serverId: agent.serverId,
            }),
            frame,
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
            answer(
                await settledAnswer(db, {
                    appOrigin,
                    candidates: decision.candidates,
                    desktopHolder: decision.desktopHolder,
                    record,
                })
            );
            return;
        }
        const scope = {
            appOrigin,
            computerId,
            fenceEpochs,
            frame,
            placementGeneration: frame.computer === undefined ? agent.placementGeneration : null,
            record,
            serverId: agent.serverId,
        };
        const gated = await gateSend(db, scope);
        if (gated.kind === 'refused') {
            if (gated.answer) {
                answer(gated.answer);
            }
            return;
        }
        const command = invokeCommand(frame, {
            invocationId: record.id,
            operation: gated.operation,
            requestedAt,
            timeoutMs,
        });
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
    };
}
