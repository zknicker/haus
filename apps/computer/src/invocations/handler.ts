import { join } from 'node:path';
import {
    agentFenceCommandSchema,
    agentPathSegment,
    type InvokeCommand,
    invocationOutcomeNotices,
    invokeCancelCommandSchema,
    invokeCommandSchema,
    invokeResultAckSchema,
} from '@haus/api';
import type * as z from 'zod';
import { holdDriveFolder } from '../drive/turn-sync.ts';
import { createKeyedQueue } from '../keyed-queue.ts';
import { cancelledBeforeStart, executeInvocation } from './handler-run.ts';
import { type AcceptedRecord, createLedger, finishedRecord, type Ledger } from './ledger.ts';
import { createOfflineHold } from './offline-hold.ts';
import type { InvocationHandler, InvocationHandlerInput } from './operation.ts';

interface ActiveInvocation {
    accepted: Promise<AcceptedRecord | null>;
    agentId: string;
    controller: AbortController;
}

export async function createInvocationHandler(input: InvocationHandlerInput) {
    const ledger = createLedger(input.agentsRoot);
    const agentByInvocation = await recoverLedger(ledger);
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
        const controller = new AbortController();
        const accepted = accept(command);
        active.set(id, { accepted, agentId: command.agentId, controller });
        track(
            queue.run(command.agentId, async () => {
                const record = await accepted;
                if (record) {
                    await holdDriveFolder(
                        join(input.agentsRoot, agentPathSegment(command.agentId)),
                        controller.signal,
                        () => run(command, record, controller)
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

    async function run(
        command: InvokeCommand,
        record: AcceptedRecord,
        controller: AbortController
    ) {
        const id = command.invocationId;
        await offline.released(controller.signal);
        const result = controller.signal.aborted
            ? cancelledBeforeStart(id)
            : await executeInvocation(command, {
                  agentsRoot: input.agentsRoot,
                  controller,
                  logPath: ledger.logPath(command.agentId, id),
                  payloads: input.payloadsFor(id),
                  runners: input.runners,
              });
        try {
            await ledger.write(finishedRecord(record, result, new Date().toISOString()));
        } finally {
            active.delete(id);
        }
        input.send(result);
    }

    function fence(agentId: string) {
        for (const entry of active.values()) {
            if (entry.agentId === agentId) {
                entry.controller.abort('cancel');
            }
        }
        return queue.settled(agentId);
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
        },
        disconnected: offline.hold,
        fence,
        receive: (frame) => {
            if (!isRecord(frame)) {
                return false;
            }
            switch (frame.type) {
                case 'invoke':
                    withParsed(invokeCommandSchema, frame, invoke);
                    return true;
                case 'invoke-cancel':
                    withParsed(invokeCancelCommandSchema, frame, ({ invocationId }) =>
                        active.get(invocationId)?.controller.abort('cancel')
                    );
                    return true;
                case 'agent-fence':
                    withParsed(agentFenceCommandSchema, frame, ({ agentId }) =>
                        track(fence(agentId))
                    );
                    return true;
                case 'invoke-result-ack':
                    withParsed(invokeResultAckSchema, frame, ({ invocationId }) =>
                        acknowledge(invocationId)
                    );
                    return true;
                default:
                    return false;
            }
        },
        settled,
    } satisfies InvocationHandler;
}

async function recoverLedger(ledger: Ledger) {
    const records = await ledger.list();
    const finishedAt = new Date().toISOString();
    await Promise.all(
        records.flatMap((record) =>
            record.state === 'accepted'
                ? [
                      ledger.write(
                          finishedRecord(
                              record,
                              {
                                  invocationId: record.invocationId,
                                  outcome: 'unknown',
                                  output: { kind: 'text', text: invocationOutcomeNotices.unknown },
                                  truncated: false,
                                  type: 'invoke-result',
                              },
                              finishedAt
                          )
                      ),
                  ]
                : []
        )
    );
    return new Map(records.map((record) => [record.invocationId, record.agentId]));
}

function withParsed<Command>(
    schema: z.ZodType<Command>,
    frame: Record<string, unknown>,
    handle: (command: Command) => void
) {
    const parsed = schema.safeParse(frame);
    if (parsed.success) {
        handle(parsed.data);
    } else {
        console.error(`Ignored a malformed ${String(frame.type)} frame.`, parsed.error.message);
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
