import { randomUUID } from 'node:crypto';
import type { IdleCompactionResult } from '../idle-compaction.ts';
import type { ClaudeConnection, TurnSink } from './claude-connection.ts';
import { ClaudeProcessExitError, ClaudeTurnError } from './claude-errors.ts';
import { cumulativeDifference } from './claude-idle-activity.ts';
import type { ClaudeCommandLifecycle, ClaudeResult, ParsedClaudeLine } from './claude-messages.ts';
import type { ClaudeExit } from './claude-process.ts';

/**
 * Long enough for a 950K-token session's summary request; past it the process is treated as
 * hung and ended, so the next turn resumes cold instead of waiting on it forever.
 */
export const DEFAULT_COMPACTION_TIMEOUT_MS = 10 * 60_000;

/**
 * Runs Claude Code's own `/compact` with no instructions on a parked connection: exactly what
 * its idle compaction calls. Claude Code answers with a `compacting` status, a `compact_boundary`
 * (pre and post tokens), the summary, and a zero-turn, zero-usage result naming our message; the
 * compaction's spend shows only in the process's cumulative cost and `modelUsage`, so the result
 * carries their difference. Rejects when the process exits, refuses, or does not compact.
 */
export async function runClaudeCompaction(
    connection: ClaudeConnection,
    options: { now?: () => Date; timeoutMs?: number } = {}
): Promise<IdleCompactionResult> {
    const now = options.now ?? (() => new Date());
    const uuid = randomUUID();
    const before = connection.idleActivity.cumulative;
    const startedAt = now();
    const sink = new CompactionSink(connection, uuid);
    const detach = connection.attach(sink);
    connection.normalizer.beginTurn();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        await connection.sendUser('/compact', { uuid });
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
                void connection.stop();
                reject(new ClaudeTurnError('Claude Code did not finish compacting in time.'));
            }, options.timeoutMs ?? DEFAULT_COMPACTION_TIMEOUT_MS);
        });
        const compacted = await Promise.race([sink.done, timeout]);
        connection.idleActivity.compacted(compacted.tokensAfter);
        const spent = cumulativeDifference(before, connection.idleActivity.cumulative);
        return {
            costUsd: spent.costUsd,
            endedAt: now(),
            modelId: connection.modelId,
            startedAt,
            summary: compacted.summary,
            tokensAfter: compacted.tokensAfter,
            tokensBefore: compacted.tokensBefore,
            usage: spent.usage,
        };
    } finally {
        clearTimeout(timer);
        sink.close();
        detach();
    }
}

interface Compacted {
    summary: string | null;
    tokensAfter: number | null;
    tokensBefore: number | null;
}

/** Takes the stream while the compaction runs, so nothing of it reaches a turn or a wake. */
class CompactionSink implements TurnSink {
    private readonly settled = Promise.withResolvers<Compacted>();
    private compaction: Compacted | null = null;
    private open = true;

    constructor(
        private readonly connection: ClaudeConnection,
        private readonly uuid: string
    ) {
        // A rejection nobody awaits yet (the write failed first) must not surface unhandled.
        this.settled.promise.catch(() => undefined);
    }

    get accepting(): boolean {
        return this.open;
    }

    get done(): Promise<Compacted> {
        return this.settled.promise;
    }

    close() {
        this.open = false;
    }

    onLine(line: ParsedClaudeLine): void {
        // Every line, the result included: a boundary with no summary flushes on the next one.
        for (const event of this.connection.normalizer.normalize(line)) {
            if (event.type === 'tool-result' && event.toolName === 'compaction') {
                this.compaction = readCompaction(event.output);
            }
        }
        if (line.message.kind === 'result') {
            this.onResult(line.message.message);
        }
    }

    onExit(exit: ClaudeExit): void {
        this.fail(
            new ClaudeProcessExitError(exit.code, exit.signal, this.connection.process.stderrTail())
        );
    }

    onLifecycle(_message: ClaudeCommandLifecycle): void {
        // The compaction's own receipts: its result is the boundary.
    }

    onUnreadable(_nativeType: string): void {
        // Liveness only; a compaction has no turn to report it to.
    }

    private onResult(result: ClaudeResult) {
        const owned =
            result.user_message_uuid === this.uuid ||
            (result.user_message_uuids ?? []).includes(this.uuid);
        if (!owned) {
            return;
        }
        if (result.is_error) {
            this.fail(new ClaudeTurnError(result.result ?? 'Claude Code refused to compact.'));
            return;
        }
        if (!this.compaction) {
            this.fail(new ClaudeTurnError(result.result ?? 'Claude Code did not compact.'));
            return;
        }
        this.open = false;
        this.settled.resolve(this.compaction);
    }

    private fail(error: Error) {
        this.open = false;
        this.settled.reject(error);
    }
}

function readCompaction(output: unknown): Compacted {
    const record = typeof output === 'object' && output !== null ? output : {};
    const value = (key: string) => (record as Record<string, unknown>)[key];
    const tokens = (key: string) => {
        const tokenCount = value(key);
        return typeof tokenCount === 'number' ? tokenCount : null;
    };
    const summary = value('summary');
    return {
        summary: typeof summary === 'string' ? summary : null,
        tokensAfter: tokens('tokensAfter'),
        tokensBefore: tokens('tokensBefore'),
    };
}
