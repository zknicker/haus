import { join } from 'node:path';
import {
    agentFenceCommandSchema,
    agentPathSegment,
    computerProcessLimit,
    type InvokeCancelCommand,
    type InvokeCommand,
    invokeCancelCommandSchema,
    invokeCommandSchema,
    invokeResultAckSchema,
    processExitAckSchema,
    type SessionArchiveCommand,
    sessionArchiveCommandSchema,
} from '@haus/api';
import { holdDriveFolder } from '../drive/turn-sync.ts';
import { createKeyedQueue } from '../keyed-queue.ts';
import { isRecord, recoverLedger, withParsed } from './handler-recovery.ts';
import { cancelledBeforeStart, executeInvocation } from './handler-run.ts';
import { type AcceptedRecord, createLedger, finishedRecord } from './ledger.ts';
import { createOfflineHold } from './offline-hold.ts';
import type { InvocationHandler, InvocationHandlerInput } from './operation.ts';
import { createProcessRegistry } from './processes/process-registry.ts';
import { createSessionFences } from './session-fences.ts';
import { computerInvocationLimit, createInvocationSlots } from './session-slots.ts';

interface ActiveInvocation {
    accepted: Promise<AcceptedRecord | null>;
    agentId: string;
    controller: AbortController;
    sessionGeneration: number;
    started: boolean;
}

const archivedText = 'This session was archived, so nothing ran.';

export async function createInvocationHandler(input: InvocationHandlerInput) {
    const ledger = createLedger(input.agentsRoot);
    const agentByInvocation = await recoverLedger(ledger);
    const processes = createProcessRegistry({
        agentsRoot: input.agentsRoot,
        limit: input.processLimit ?? computerProcessLimit,
        send: input.send,
    });
    await processes.recover();
    const fences = createSessionFences(input.agentsRoot);
    const slots = createInvocationSlots(input.invocationLimit ?? computerInvocationLimit);
    const active = new Map<string, ActiveInvocation>();
    const queue = createKeyedQueue((error) => console.error('Invocation did not finish.', error));
    const pending = new Set<Promise<void>>();
    const offline = createOfflineHold();

    function track(work: Promise<void>) {
        const tracked = work.catch((error: unknown) =>
            console.error('Invocation frame handling failed.', error)
        );
        pending.add(tracked);
        void tracked.then(() => pending.delete(tracked));
    }

    function invoke(command: InvokeCommand) {
        const id = command.invocationId;
        const current = active.get(id);
        if (current) {
            track(
                current.accepted.then((record) => {
                    if (record) {
                        input.send({ invocationId: id, type: 'invoke-accepted' });
                    }
                })
            );
            return;
        }
        const knownAgentId = agentByInvocation.get(id);
        if (knownAgentId !== undefined) {
            track(answerFromLedger(knownAgentId, id));
            return;
        }
        const accepted = accept(command);
        const entry = {
            accepted,
            agentId: command.agentId,
            controller: new AbortController(),
            sessionGeneration: command.sessionGeneration,
            started: false,
        };
        active.set(id, entry);
        track(
            queue.run(sessionKey(entry), async () => {
                const record = await accepted;
                if (record) {
                    await holdDriveFolder(
                        join(input.agentsRoot, agentPathSegment(command.agentId)),
                        entry.controller.signal,
                        () => run(command, record, entry)
                    );
                }
            })
        );
    }

    async function accept(command: InvokeCommand) {
        const record: AcceptedRecord = {
            acceptedAt: new Date().toISOString(),
            agentId: command.agentId,
            invocationId: command.invocationId,
            operationKind: command.operation.kind,
            runId: command.runId,
            state: 'accepted',
        };
        try {
            await ledger.write(record);
        } catch (error) {
            active.delete(record.invocationId);
            console.error('Invocation was not accepted.', error);
            return null;
        }
        agentByInvocation.set(record.invocationId, record.agentId);
        input.send({ invocationId: record.invocationId, type: 'invoke-accepted' });
        return record;
    }

    async function run(command: InvokeCommand, record: AcceptedRecord, entry: ActiveInvocation) {
        const id = command.invocationId;
        try {
            const result = await execute(command, entry);
            await ledger.write(finishedRecord(record, result, new Date().toISOString()));
            input.send(result);
        } finally {
            active.delete(id);
        }
    }

    async function execute(command: InvokeCommand, entry: ActiveInvocation) {
        const id = command.invocationId;
        const { controller } = entry;
        await offline.released(controller.signal);
        if (!(await fences.allows(command.agentId, command.sessionGeneration))) {
            return cancelledBeforeStart(id, archivedText);
        }
        const release = await slots.acquire(controller.signal);
        if (!release) {
            return cancelledBeforeStart(id);
        }
        const startable = () =>
            !(controller.signal.aborted || Date.now() >= Date.parse(command.notAfter));
        try {
            return startable()
                ? await executeInvocation(command, {
                      agentsRoot: input.agentsRoot,
                      controller,
                      logPath: ledger.logPath(command.agentId, id),
                      payloads: input.payloadsFor(id),
                      processes,
                      runners: input.runners,
                      start: () => {
                          entry.started = startable();
                          return entry.started;
                      },
                  })
                : cancelledBeforeStart(id);
        } finally {
            release();
        }
    }

    function cancel(command: InvokeCancelCommand) {
        const entry = active.get(command.invocationId);
        if (entry && !(command.dropIfNotStarted && entry.started)) {
            entry.controller.abort('cancel');
        }
    }

    async function stopSessions(agentId: string, before?: number) {
        const keys = new Set<string>();
        for (const entry of active.values()) {
            if (
                entry.agentId === agentId &&
                (before === undefined || entry.sessionGeneration < before)
            ) {
                entry.controller.abort('cancel');
                keys.add(sessionKey(entry));
            }
        }
        await processes.stopSession(agentId, {
            ...(before === undefined ? {} : { before }),
            ending: before === undefined ? 'revoked' : 'archived',
        });
        await Promise.all([...keys].map((key) => queue.settled(key)));
    }

    async function archive(command: SessionArchiveCommand) {
        await fences.archive(command.agentId, command.generation);
        await stopSessions(command.agentId, command.generation);
    }

    async function answerFromLedger(agentId: string, invocationId: string) {
        const record = await ledger.read(agentId, invocationId);
        if (!record) {
            return;
        }
        input.send({ invocationId, type: 'invoke-accepted' });
        if (record.state === 'finished') {
            input.send(record.result);
        }
    }

    function acknowledge(invocationId: string) {
        const agentId = agentByInvocation.get(invocationId);
        if (agentId === undefined) {
            return;
        }
        track(
            ledger.read(agentId, invocationId).then(async (record) => {
                if (record?.state === 'finished' && record.confirmedAt === undefined) {
                    await ledger.write({ ...record, confirmedAt: new Date().toISOString() });
                }
            })
        );
    }

    async function settled() {
        while (pending.size > offline.parked()) {
            await Promise.race([...pending, offline.parking()]);
        }
    }

    return {
        connected: async () => {
            offline.release();
            const records = await ledger.list();
            const unconfirmed = records
                .flatMap((record) =>
                    record.state === 'finished' && record.confirmedAt === undefined ? [record] : []
                )
                .sort((a, b) => a.acceptedAt.localeCompare(b.acceptedAt));
            for (const record of unconfirmed) {
                if (!input.send(record.result)) {
                    break;
                }
            }
            const pruned = await ledger.prune(Date.now(), records);
            for (const invocationId of pruned) {
                agentByInvocation.delete(invocationId);
            }
            await processes.resend();
        },
        disconnected: offline.hold,
        fence: (agentId) => stopSessions(agentId),
        receive: (frame) => {
            if (!isRecord(frame)) {
                return false;
            }
            switch (frame.type) {
                case 'invoke':
                    withParsed(invokeCommandSchema, frame, invoke);
                    return true;
                case 'invoke-cancel':
                    withParsed(invokeCancelCommandSchema, frame, cancel);
                    return true;
                case 'agent-fence':
                    withParsed(agentFenceCommandSchema, frame, ({ agentId }) =>
                        track(stopSessions(agentId))
                    );
                    return true;
                case 'task-archive':
                    withParsed(sessionArchiveCommandSchema, frame, (command) =>
                        track(archive(command))
                    );
                    return true;
                case 'invoke-result-ack':
                    withParsed(invokeResultAckSchema, frame, ({ invocationId }) =>
                        acknowledge(invocationId)
                    );
                    return true;
                case 'process-exit-ack':
                    withParsed(processExitAckSchema, frame, ({ processId }) =>
                        track(processes.acknowledge(processId))
                    );
                    return true;
                default:
                    return false;
            }
        },
        settled,
    } satisfies InvocationHandler;
}

function sessionKey(entry: Pick<ActiveInvocation, 'agentId' | 'sessionGeneration'>) {
    return `${entry.agentId}:${entry.sessionGeneration}`;
}
