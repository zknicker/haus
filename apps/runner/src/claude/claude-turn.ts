import { EventQueue } from '../turn/event-queue.ts';
import type { SteerResult } from '../turn/runtime-driver.ts';
import {
    addTokenUsage,
    isFatalTurnEvent,
    type RuntimeTokenUsage,
    type TurnEvent,
} from '../turn/turn-event.ts';
import type { ClaudeConnection, TurnSink } from './claude-connection.ts';
import {
    ClaudeSessionEndedError,
    ClaudeTurnError,
    claudeResumeRejection,
} from './claude-errors.ts';
import type {
    ClaudeCommandLifecycle,
    ClaudeResult,
    ParsedClaudeMessage,
} from './claude-messages.ts';
import { answeredMessages, classifyResult, claudeTokenUsage } from './claude-result.ts';
import {
    awaitSteerReceipt,
    ClaudeTurnSteers,
    SteerReceiptTimeoutError,
    steerReceiptMs,
} from './claude-turn-steers.ts';

const interruptGraceMs = 5000;

export class ClaudeTurn implements TurnSink {
    readonly events = new EventQueue<TurnEvent>();
    private readonly settled = Promise.withResolvers<void>();
    private readonly steers = new ClaudeTurnSteers();
    private readonly ownMessages = new Set<string>();
    private readonly detachSink: () => void;
    private aborting = false;
    private discardQueued = false;
    private failed = false;
    private finishing = false;
    private interruptRequested = false;
    private resultSeen = false;
    private usage: RuntimeTokenUsage | null = null;

    constructor(
        private readonly connection: ClaudeConnection,
        private readonly signal: AbortSignal
    ) {
        connection.normalizer.beginTurn();
        this.detachSink = connection.attach(this);
        const onAbort = () => this.abort();
        signal.addEventListener('abort', onAbort, { once: true });
        this.settled.promise.then(() => signal.removeEventListener('abort', onAbort));
    }

    get isSettled() {
        return this.finishing;
    }

    get accepting() {
        return !this.finishing;
    }

    start(prompt: string) {
        if (this.signal.aborted) {
            this.aborting = true;
            this.finish();
            return;
        }
        const uuid = crypto.randomUUID();
        this.ownMessages.add(uuid);
        try {
            this.connection.sendUser(prompt, { uuid });
        } catch (error) {
            this.fail({ error, type: 'error' });
            this.finish();
        }
    }

    settle() {
        return this.settled.promise;
    }

    unconsumedSteers() {
        return this.steers.unconsumed();
    }

    async steer(text: string) {
        if (this.finishing) {
            const idle: SteerResult = { delivered: false, reason: 'idle' };
            return idle;
        }
        if (this.failed || this.aborting) {
            return refused(new ClaudeTurnError('The turn is ending.'));
        }
        const uuid = crypto.randomUUID();
        const acknowledged = this.steers.track(uuid, text);
        this.ownMessages.add(uuid);
        try {
            this.connection.sendUser(text, { priority: 'next', uuid });
            await awaitSteerReceipt(acknowledged, steerReceiptMs);
        } catch (error) {
            if (!(error instanceof SteerReceiptTimeoutError)) {
                this.steers.drop(uuid);
                this.trySettle();
                return refused(error);
            }
        }
        this.steers.delivered(uuid);
        const delivered: SteerResult = { delivered: true };
        return delivered;
    }

    onMessage(parsed: ParsedClaudeMessage) {
        if (parsed.message.kind === 'result') {
            this.onResult(parsed.message.message);
            return;
        }
        if (this.failed) {
            return;
        }
        for (const event of this.connection.normalizer.normalize(parsed)) {
            if (isFatalTurnEvent(event)) {
                this.fail(event);
                return;
            }
            this.events.push(event);
        }
    }

    onLifecycle(message: ClaudeCommandLifecycle) {
        if (this.steers.onLifecycle(message)) {
            this.trySettle();
        }
    }

    onEnded(error: unknown) {
        if (this.finishing) {
            return;
        }
        if (!(this.aborting || this.failed)) {
            this.fail({
                error: claudeResumeRejection(error) ?? new ClaudeSessionEndedError(error),
                type: 'error',
            });
        }
        this.finish();
    }

    private onResult(result: ClaudeResult) {
        const answered = answeredMessages(result);
        if (answered.length > 0 && !answered.some((uuid) => this.ownMessages.has(uuid))) {
            this.events.push({ nativeType: 'result:foreign', type: 'progress' });
            return;
        }
        this.resultSeen = true;
        this.usage = addTokenUsage(this.usage, claudeTokenUsage(result.usage));
        this.events.push({ nativeType: 'result', type: 'progress' });
        this.steers.completed(answered);
        if (!(this.aborting || this.failed)) {
            const outcome = classifyResult(result, this.connection.normalizer);
            if (outcome.kind !== 'success') {
                const error =
                    outcome.kind === 'failed'
                        ? outcome.error
                        : new ClaudeTurnError('Execution failed');
                this.fail({ error: claudeResumeRejection(error) ?? error, type: 'error' });
            }
        }
        this.trySettle();
    }

    private trySettle() {
        const pending = !this.interruptRequested && this.steers.pending;
        if (this.resultSeen && !pending) {
            this.finish();
        }
    }

    private finish() {
        if (this.finishing) {
            return;
        }
        this.finishing = true;
        if (this.aborting && !this.failed) {
            this.events.push({ type: 'abort' });
        } else if (!this.failed) {
            this.events.push({ claudePlanUsage: null, type: 'turn-finish', usage: this.usage });
        }
        this.events.end();
        this.detachSink();
        if (this.discardQueued) {
            this.connection.close();
        }
        this.settled.resolve();
    }

    private fail(event: TurnEvent) {
        if (this.failed) {
            return;
        }
        this.failed = true;
        this.events.push(event);
        this.events.end();
        this.interrupt();
    }

    private abort() {
        if (this.aborting || this.finishing) {
            return;
        }
        this.aborting = true;
        this.interrupt();
    }

    private interrupt() {
        if (this.interruptRequested || this.finishing) {
            return;
        }
        this.interruptRequested = true;
        const kill = () => this.connection.close();
        const killAfter = setTimeout(kill, interruptGraceMs);
        this.settled.promise.then(() => clearTimeout(killAfter));
        this.connection.interrupt().then((stillQueued) => {
            if (stillQueued.some((uuid) => this.ownMessages.has(uuid))) {
                this.discardQueued = true;
                if (this.finishing) {
                    this.connection.close();
                }
            }
        }, kill);
    }
}

function refused(error: unknown) {
    const result: SteerResult = { delivered: false, error, reason: 'failed' };
    return result;
}
