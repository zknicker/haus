import { randomUUID } from 'node:crypto';
import type { SteerResult } from '../driver.ts';
import { EventQueue } from '../event-queue.ts';
import type { RuntimeTokenUsage, TurnEvent } from '../turn-event.ts';
import type { ClaudeConnection, TurnSink } from './claude-connection.ts';
import { ClaudeProcessExitError, ClaudeTurnError, claudeResumeRejection } from './claude-errors.ts';
import type { ClaudeCommandLifecycle, ClaudeResult, ParsedClaudeLine } from './claude-messages.ts';
import { readClaudePlanUsage } from './claude-plan-usage.ts';
import {
    awaitSteerReceipt,
    SteerReceiptTimeoutError,
    steerReceiptMs,
} from './claude-steer-receipt.ts';
import type { ClaudeExit } from './claude-process.ts';
import {
    addUsage,
    classifyResult,
    claudeTokenUsage,
    isFatalTurnEvent,
} from './claude-result.ts';

/** How long an interrupted turn may take to reach its result before the process is killed. */
const interruptGraceMs = 5000;
const terminalLifecycle = new Set(['cancelled', 'completed', 'discarded']);
/** Lifecycle states that prove Claude Code handed the message to the model. */
const consumedLifecycle = new Set(['completed', 'started']);

interface Steer {
    ack?: { reject(error: Error): void; resolve(): void };
    /** The steer reported `delivered` to its caller. */
    delivered: boolean;
    state: string;
    readonly text: string;
}

/**
 * One turn on a live connection: the initial user message, any steering written into it, and
 * every result until the runtime is idle. A steer Claude Code queues past a result runs as one
 * more result inside the same turn, as the AI SDK bridge did.
 */
export class ClaudeTurn implements TurnSink {
    readonly events = new EventQueue<TurnEvent>();
    private readonly settled = Promise.withResolvers<void>();
    private readonly steers = new Map<string, Steer>();
    /** Every user message this turn wrote (prompt and steers); only their results are its own. */
    private readonly ownMessages = new Set<string>();
    private aborting = false;
    private readonly detachSink: () => void;
    private failed = false;
    private finishing = false;
    private interruptRequested = false;
    private resultSeen = false;
    private usage: RuntimeTokenUsage | null = null;

    constructor(
        private readonly connection: ClaudeConnection,
        private readonly options: {
            collectPlanUsage: boolean;
            signal: AbortSignal;
            /** How long a written steer may wait for its queue receipt; tests shorten it. */
            steerAckMs?: number;
        }
    ) {
        this.detachSink = connection.attach(this);
        connection.normalizer.beginTurn();
        const onAbort = () => this.abort();
        options.signal.addEventListener('abort', onAbort, { once: true });
        void this.settled.promise.then(() => options.signal.removeEventListener('abort', onAbort));
    }

    get isSettled(): boolean {
        return this.finishing;
    }

    /** Writes the turn's prompt; a failed write ends the turn on the process's own error. */
    async start(prompt: string): Promise<void> {
        if (this.options.signal.aborted) {
            // Nothing reached Claude Code, so the runtime is already at its idle boundary.
            this.aborting = true;
            await this.finish();
            return;
        }
        const uuid = randomUUID();
        this.ownMessages.add(uuid);
        try {
            await this.connection.sendUser(prompt, { uuid });
        } catch (error) {
            this.fail({ error, type: 'error' });
            void this.finish();
        }
    }

    settle(): Promise<void> {
        return this.settled.promise;
    }

    /** Delivered steers Claude Code never started: cancelled by an interrupt, or still queued. */
    unconsumedSteers(): readonly string[] {
        return [...this.steers.values()]
            .filter((steer) => steer.delivered && !consumedLifecycle.has(steer.state))
            .map((steer) => steer.text);
    }

    async steer(text: string): Promise<SteerResult> {
        if (this.finishing) {
            return { delivered: false, reason: 'idle' };
        }
        if (this.failed || this.aborting) {
            return {
                delivered: false,
                error: new ClaudeTurnError('The turn is ending.'),
                reason: 'failed',
            };
        }
        const uuid = randomUUID();
        const steer: Steer = { delivered: false, state: 'written', text };
        this.steers.set(uuid, steer);
        const acknowledged = new Promise<void>((resolve, reject) => {
            steer.ack = { reject, resolve };
        });
        this.ownMessages.add(uuid);
        try {
            await this.connection.sendUser(text, { priority: 'next', uuid });
        } catch (error) {
            // Never written, so nothing will answer it; it must not hold the turn open.
            return this.dropSteer(uuid, error);
        }
        if (this.connection.supportsLifecycle) {
            try {
                await awaitSteerReceipt(acknowledged, this.options.steerAckMs ?? steerReceiptMs);
            } catch (error) {
                if (!(error instanceof SteerReceiptTimeoutError)) {
                    // Claude Code cancelled or discarded it: the model will never see it.
                    return this.dropSteer(uuid, error);
                }
                // Written but unconfirmed: Claude Code still holds the message, so it stays
                // tracked (holding the turn open and counted unconsumed until it starts) and is
                // reported delivered, so its notice is not steered again next turn.
            }
        }
        steer.delivered = true;
        return { delivered: true };
    }

    onLine(line: ParsedClaudeLine): void {
        if (line.message.kind === 'result') {
            this.onResult(line.message.message);
            return;
        }
        if (this.failed) {
            return;
        }
        for (const event of this.connection.normalizer.normalize(line)) {
            if (isFatalTurnEvent(event)) {
                this.fail(event);
                return;
            }
            this.events.push(event);
        }
    }

    onLifecycle(message: ClaudeCommandLifecycle): void {
        const steer = this.steers.get(message.command_uuid);
        if (!steer) {
            return;
        }
        steer.state = message.state;
        if (message.state === 'queued' || message.state === 'started') {
            steer.ack?.resolve();
        } else if (message.state === 'cancelled' || message.state === 'discarded') {
            steer.ack?.reject(new ClaudeTurnError(`Claude Code ${message.state} the message.`));
        }
        void this.trySettle();
    }

    onUnreadable(nativeType: string): void {
        if (!this.failed) {
            this.events.push({ nativeType, type: 'progress' });
        }
    }

    onExit(exit: ClaudeExit): void {
        if (this.finishing) {
            return;
        }
        if (!(this.aborting || this.failed)) {
            this.fail({
                error: new ClaudeProcessExitError(
                    exit.code,
                    exit.signal,
                    this.connection.process.stderrTail()
                ),
                type: 'error',
            });
        }
        void this.finish();
    }

    private dropSteer(uuid: string, error: unknown): SteerResult {
        this.steers.delete(uuid);
        void this.trySettle();
        return { delivered: false, error, reason: 'failed' };
    }

    private onResult(result: ClaudeResult) {
        const answered = [result.user_message_uuid, ...(result.user_message_uuids ?? [])].filter(
            (uuid): uuid is string => Boolean(uuid)
        );
        if (answered.length > 0 && !answered.some((uuid) => this.ownMessages.has(uuid))) {
            // Another turn's message (a late steer) answered on this warm connection: liveness
            // only, never this turn's outcome.
            this.events.push({ nativeType: 'result:foreign', type: 'progress' });
            return;
        }
        this.resultSeen = true;
        this.usage = addUsage(this.usage, claudeTokenUsage(result.usage));
        // A result that does not settle the turn (a queued steer runs next) is still liveness.
        this.events.push({ nativeType: 'result', type: 'progress' });
        for (const uuid of [result.user_message_uuid, ...(result.user_message_uuids ?? [])]) {
            const steer = uuid ? this.steers.get(uuid) : undefined;
            if (steer) {
                steer.state = 'completed';
            }
        }
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
        void this.trySettle();
    }

    private async trySettle() {
        // An interrupt cancels queued messages too, so its result is the idle boundary.
        const pending =
            !this.interruptRequested &&
            [...this.steers.values()].some((steer) => !terminalLifecycle.has(steer.state));
        if (this.resultSeen && !pending) {
            await this.finish();
        }
    }

    private async finish() {
        if (this.finishing) {
            return;
        }
        this.finishing = true;
        try {
            if (this.aborting && !this.failed) {
                this.events.push({ type: 'abort' });
            } else if (!this.failed) {
                const claudePlanUsage = this.options.collectPlanUsage
                    ? await readClaudePlanUsage(this.connection)
                    : null;
                this.events.push({ claudePlanUsage, type: 'turn-finish', usage: this.usage });
            }
        } finally {
            this.events.end();
            this.detachSink();
            this.settled.resolve();
        }
    }

    /** A fatal event ends the stream now; the runtime is interrupted back to idle behind it. */
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
        // The bridge's hard stop: a turn that ignores the interrupt loses its process. A process
        // that will not die leaves the turn unsettled, and the executor's settle deadline fails it.
        const kill = () => this.connection.process.stop().catch(() => undefined);
        const killAfter = setTimeout(kill, interruptGraceMs);
        void this.settled.promise.then(() => clearTimeout(killAfter));
        this.connection
            .control({ cancel_queued: true, subtype: 'interrupt' }, interruptGraceMs)
            .catch(kill);
    }
}
