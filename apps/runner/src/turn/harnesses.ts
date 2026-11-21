import { createClaudeHarness } from '../claude/claude-driver.ts';
import { createIdleCompactionReporter } from '../claude/idle-compaction-reporter.ts';
import type { IdleCompactionGate } from '../claude/idle-compaction-scheduler.ts';
import type { JournalUploads } from '../journal/journal-uploads.ts';
import type { ConnectionBook } from '../model-connections/connection-book.ts';
import type { CapacityReader } from '../model-connections/connection-capacity.ts';
import { createPiHarness } from '../pi/pi-driver.ts';
import { connectionModels, piProviderFor } from '../pi/pi-models.ts';
import type { RunnerLink } from '../run-context.ts';
import { harnessFor, type RuntimeDriverFactory } from './runtime-driver.ts';

export function createHarnesses(input: {
    agentBusy: (agentId: string) => boolean;
    book: ConnectionBook;
    capacity?: CapacityReader;
    journal?: JournalUploads;
    link: RunnerLink;
    log: (line: string) => void;
    maxWarm: number;
}) {
    const { capacity } = input;
    const claude = createClaudeHarness({
        hooks: createIdleCompactionReporter({
            agentBusy: input.agentBusy,
            link: input.link,
            log: input.log,
            ...(input.journal ? { uploads: input.journal } : {}),
        }),
        maxWarm: input.maxWarm,
        ...(capacity
            ? { onCapacity: (connection, windows) => capacity.observed(connection, windows) }
            : {}),
    });
    const pi = createPiHarness({
        log: input.log,
        maxWarm: input.maxWarm,
        models: (launch) =>
            connectionModels({
                book: input.book,
                connectionId: launch.connection.id,
                link: input.link,
                provider: piProviderFor(launch.connection.provider),
            }),
    });
    const factory: RuntimeDriverFactory = (launch) =>
        harnessFor(launch.modelId) === 'pi-durable' ? pi.factory(launch) : claude.factory(launch);
    return {
        close() {
            claude.close();
            return pi.close();
        },
        factory,
        setIdleCompaction(gate: IdleCompactionGate) {
            claude.setIdleCompaction(gate);
        },
        release(agentId: string) {
            return Promise.all([claude.release(agentId), pi.release(agentId)]);
        },
    };
}
