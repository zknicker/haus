import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { WatchCall, WatchEnd } from '@earendil-works/chord/watch';
import {
    type Conversation,
    ConversationIdle,
    type ConversationView,
    type Harness,
    type Observation,
    type Submission,
} from '@earendil-works/pi-durable';
import type { InvocationOutcome } from '@haus/api';
import { EventQueue } from '../turn/event-queue.ts';
import type { SteerResult } from '../turn/runtime-driver.ts';
import { isFatalTurnEvent, type TurnEvent } from '../turn/turn-event.ts';
import { PiTurnEvents } from './pi-events.ts';
import { PiSessionEndedError, runFailureEvent } from './pi-failures.ts';
import type { HostedSearchLog } from './pi-hosted-search.ts';
import { PiTurnSteers } from './pi-turn-steers.ts';

const context = BACKGROUND_CONTEXT;

export interface PiTurnDeps {
    readonly harness: Harness;
    readonly invocations: ReadonlyMap<string, InvocationOutcome>;
    readonly newId: () => string;
    readonly root: Conversation;
    readonly searches: HostedSearchLog;
    readonly signal: AbortSignal;
}

export class PiTurn {
    readonly events = new EventQueue<TurnEvent>();
    private readonly settled = Promise.withResolvers<void>();
    private readonly pending: ConversationView[] = [];
    private readonly steers = new PiTurnSteers();
    private derived: PiTurnEvents | null = null;
    private observation: Observation<ConversationView> | null = null;
    private aborting = false;
    private failed = false;
    private finished = false;

    private constructor(private readonly deps: PiTurnDeps) {}

    static async start(deps: PiTurnDeps, prompt: string) {
        const turn = new PiTurn(deps);
        await turn.begin(prompt);
        return turn;
    }

    get isSettled() {
        return this.finished;
    }

    settle() {
        return this.settled.promise;
    }

    async steer(text: string) {
        if (this.finished) {
            return idle;
        }
        if (this.failed || this.aborting) {
            return refused(new Error('The Pi turn is ending.'));
        }
        let submission: Submission;
        try {
            submission = await this.deps.root.submit(
                { content: text, type: 'input', whenBusy: 'steer', whenIdle: 'reject' },
                context
            );
        } catch (error) {
            return error instanceof ConversationIdle ? idle : refused(error);
        }
        return (await this.steers.track(submission, text)) ? delivered : idle;
    }

    unconsumedSteers() {
        return this.steers.unconsumed();
    }

    private async begin(prompt: string) {
        const { harness, root, signal } = this.deps;
        this.observation = await harness.observeConversation(
            root.id,
            { advance: (call) => this.onView(call), end: (end) => this.onEnded(end) },
            context
        );
        const derived = new PiTurnEvents(this.observation.value, this.deps);
        this.derived = derived;
        for (const view of this.pending.splice(0)) {
            this.derive(derived, view);
        }
        if (signal.aborted) {
            this.aborting = true;
            this.finish();
            return;
        }
        signal.addEventListener('abort', this.onAbort, { once: true });
        try {
            await root.submit({ content: prompt, type: 'input', whenBusy: 'reject' }, context);
        } catch (error) {
            this.fail({ error, type: 'error' });
            this.finish();
            return;
        }
        if (this.aborting) {
            this.abortRun();
        }
        root.waitForIdle(context).then(
            () => this.finish(),
            (error: unknown) => {
                this.fail({ error, type: 'error' });
                this.finish();
            }
        );
    }

    private readonly onAbort = () => {
        if (this.aborting || this.finished) {
            return;
        }
        this.aborting = true;
        this.abortRun();
    };

    private abortRun() {
        this.deps.root.abort(context).catch((error: unknown) => {
            this.fail({ error, type: 'error' });
            this.finish();
        });
    }

    private onView(call: WatchCall<ConversationView>) {
        if (call.kind !== 'value' || this.finished) {
            return;
        }
        this.steers.observe(call.value);
        if (this.derived) {
            this.derive(this.derived, call.value);
        } else {
            this.pending.push(call.value);
        }
    }

    private derive(derived: PiTurnEvents, view: ConversationView) {
        const { events, failure } = derived.advance(view);
        for (const event of events) {
            if (isFatalTurnEvent(event)) {
                this.fail(event);
                return;
            }
            this.events.push(event);
        }
        if (failure && !(failure.reason === 'aborted' && this.aborting)) {
            this.fail(runFailureEvent(failure));
        }
    }

    private onEnded(end: WatchEnd) {
        if (!(this.finished || this.aborting)) {
            this.fail({ error: new PiSessionEndedError(end), type: 'error' });
        }
        this.finish();
    }

    private fail(event: TurnEvent) {
        if (this.failed || this.finished) {
            return;
        }
        this.failed = true;
        this.events.push(event);
        this.events.end();
    }

    private finish() {
        if (this.finished) {
            return;
        }
        this.finished = true;
        this.deps.signal.removeEventListener('abort', this.onAbort);
        this.observation?.detach();
        if (this.aborting && !this.failed) {
            this.events.push({ type: 'abort' });
        } else if (!this.failed) {
            this.events.push({
                claudePlanUsage: null,
                type: 'turn-finish',
                usage: this.derived?.usage ?? null,
            });
        }
        this.events.end();
        this.steers.close().then(() => this.settled.resolve());
    }
}

const delivered: SteerResult = { delivered: true };
const idle: SteerResult = { delivered: false, reason: 'idle' };

function refused(error: unknown) {
    const result: SteerResult = { delivered: false, error, reason: 'failed' };
    return result;
}
