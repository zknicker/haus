import type { ClaudeConnection, TurnSink } from './claude-connection.ts';
import { ClaudeSessionEndedError, ClaudeTurnError } from './claude-errors.ts';
import { cumulativeDifference } from './claude-idle-activity.ts';
import type { ClaudeResult, ParsedClaudeMessage } from './claude-messages.ts';
import { answeredMessages } from './claude-result.ts';
import type { IdleCompactionResult } from './idle-compaction.ts';

export const DEFAULT_COMPACTION_TIMEOUT_MS = 10 * 60_000;

export type CompactionPort = Pick<
    ClaudeConnection,
    'attach' | 'close' | 'idleActivity' | 'modelId' | 'normalizer' | 'sendUser'
>;

export async function runClaudeCompaction(
    connection: CompactionPort,
    options: { now?: () => Date; timeoutMs?: number } = {}
) {
    const now = options.now ?? (() => new Date());
    const uuid = crypto.randomUUID();
    const before = connection.idleActivity.cumulative;
    const startedAt = now();
    const sink = new CompactionSink(connection, uuid);
    const detach = connection.attach(sink);
    connection.normalizer.beginTurn();
    const timeout = Promise.withResolvers<never>();
    timeout.promise.catch(() => undefined);
    const timer = setTimeout(() => {
        connection.close();
        timeout.reject(new ClaudeTurnError('Claude Code did not finish compacting in time.'));
    }, options.timeoutMs ?? DEFAULT_COMPACTION_TIMEOUT_MS);
    try {
        connection.sendUser('/compact', { uuid });
        const compacted = await Promise.race([sink.done, timeout.promise]);
        connection.idleActivity.compacted(compacted.tokensAfter);
        const spent = cumulativeDifference(before, connection.idleActivity.cumulative);
        const result: IdleCompactionResult = {
            costUsd: spent.costUsd,
            endedAt: now(),
            modelId: connection.modelId,
            startedAt,
            summary: compacted.summary,
            tokensAfter: compacted.tokensAfter,
            tokensBefore: compacted.tokensBefore,
            usage: spent.usage,
        };
        return result;
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

class CompactionSink implements TurnSink {
    private readonly settled = Promise.withResolvers<Compacted>();
    private compaction: Compacted | null = null;
    private open = true;

    constructor(
        private readonly connection: CompactionPort,
        private readonly uuid: string
    ) {
        this.settled.promise.catch(() => undefined);
    }

    get accepting() {
        return this.open;
    }

    get done() {
        return this.settled.promise;
    }

    close() {
        this.open = false;
    }

    onMessage(parsed: ParsedClaudeMessage) {
        for (const event of this.connection.normalizer.normalize(parsed)) {
            if (event.type === 'tool-result' && event.toolName === 'compaction') {
                this.compaction = readCompaction(event.output);
            }
        }
        if (parsed.message.kind === 'result') {
            this.onResult(parsed.message.message);
        }
    }

    onEnded(error: unknown) {
        this.fail(new ClaudeSessionEndedError(error));
    }

    onLifecycle() {
        return;
    }

    private onResult(result: ClaudeResult) {
        if (!answeredMessages(result).includes(this.uuid)) {
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

function readCompaction(output: unknown) {
    const record = typeof output === 'object' && output !== null ? output : {};
    const value = (key: string) => (record as Record<string, unknown>)[key];
    const tokens = (key: string) => {
        const tokenCount = value(key);
        return typeof tokenCount === 'number' ? tokenCount : null;
    };
    const summary = value('summary');
    const compacted: Compacted = {
        summary: typeof summary === 'string' ? summary : null,
        tokensAfter: tokens('tokensAfter'),
        tokensBefore: tokens('tokensBefore'),
    };
    return compacted;
}
