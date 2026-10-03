import { isTerminalCloudAgentStatus } from '@haus/api';
import { Effect } from 'effect';
import type { DaemonRuntime } from '../daemon-runtime.ts';
import { foreign } from './foreign-operation.ts';
import type { CloudLaunchJournal, CloudLaunchRecord } from './launch-journal.ts';
import type { CloudAgentProvider, CloudAgentRunRef } from './provider.ts';

type Pending = Extract<CloudLaunchRecord, { phase: 'pending' }>;

/** Serializes short queue transitions; waiting for a remote turn never holds the permit. */
export class CloudAgentSendQueue {
    private readonly permit;

    constructor(
        runtime: DaemonRuntime,
        private readonly journal: CloudLaunchJournal,
        private readonly serverId: string,
        private readonly provider: () => CloudAgentProvider
    ) {
        this.permit = runtime.runSync(Effect.makeSemaphore(1));
    }

    advance(ref: CloudAgentRunRef, cancelled: () => boolean) {
        const self = this;
        return this.permit.withPermits(1)(
            Effect.gen(function* () {
                const record = yield* foreign(() => self.journal.read(self.serverId, ref));
                if (record?.phase !== 'pending') {
                    return record;
                }
                const stop = cancelled();
                if (!(yield* self.predecessorsReady(record, stop))) {
                    return record;
                }
                if (cancelled()) {
                    yield* foreign(() => self.journal.cancel(self.serverId, ref));
                } else {
                    const launch = yield* foreign(() =>
                        self.provider().send({
                            idempotencyKey: ref.runId,
                            instructions: record.instructions,
                            model: record.model,
                            providerAgentId: record.providerAgentId,
                        })
                    );
                    yield* foreign(() => self.journal.record(self.serverId, ref, launch));
                }
                return yield* foreign(() => self.journal.read(self.serverId, ref));
            })
        );
    }

    private predecessorsReady(pending: Pending, stop: boolean) {
        const self = this;
        return Effect.gen(function* () {
            for (const previous of pending.predecessors) {
                if (!(yield* self.previousReady(previous, stop || pending.interrupt))) {
                    return false;
                }
            }
            return true;
        });
    }

    private previousReady(previous: CloudAgentRunRef, stop: boolean) {
        const self = this;
        return Effect.gen(function* () {
            const record = yield* foreign(() => self.journal.read(self.serverId, previous));
            if (record?.phase === 'cancelled' || record?.phase === 'rejected') {
                return true;
            }
            if (record?.phase === 'pending') {
                if (stop) {
                    yield* foreign(() => self.journal.cancel(self.serverId, previous));
                }
                return stop;
            }
            const ref = record?.phase === 'launched' ? { ...previous, ...record.launch } : previous;
            if (!(ref.providerAgentId && ref.providerRunId)) {
                return false;
            }
            const observation = yield* foreign((signal) => self.provider().read(ref, signal));
            if (isTerminalCloudAgentStatus(observation.status)) {
                return true;
            }
            if (stop) {
                yield* foreign((signal) => self.provider().cancel(ref, signal));
            }
            return false;
        });
    }
}
