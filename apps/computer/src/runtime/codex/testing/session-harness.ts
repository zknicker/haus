import type { RuntimeResumeState } from '../../resume-state.ts';
import type { TurnEvent } from '../../turn-event.ts';
import type { CodexDriverOptions } from '../codex-driver.ts';
import type { CodexSession } from '../codex-session.ts';
import { FakeAppServer } from './fake-app-server.ts';
import { testCodexDriver } from './replay-driver.ts';

/** Opens a Codex session on a fake app-server. */
export async function openFake(
    fake = new FakeAppServer(),
    options: { overrides?: Partial<CodexDriverOptions>; resumeFrom?: RuntimeResumeState } = {}
): Promise<{ fake: FakeAppServer; session: CodexSession }> {
    const driver = testCodexDriver(() => fake, options.overrides);
    const session = (await driver.openSession({
        resumeFrom: options.resumeFrom,
        sessionId: 'agent-1',
    })) as CodexSession;
    return { fake, session };
}

export interface LiveTurn {
    readonly abort: AbortController;
    /** Every event so far, in order. */
    readonly events: TurnEvent[];
    /** Resolves with every event once the turn's stream ends. */
    readonly finished: Promise<TurnEvent[]>;
    readonly settle: () => Promise<void>;
    readonly turnId: string;
    readonly unconsumedSteers: () => readonly string[];
}

/** Starts a turn on a fake and drains its events in the background. */
export async function startFakeTurn(
    fake: FakeAppServer,
    session: CodexSession,
    prompt = 'go'
): Promise<LiveTurn> {
    const abort = new AbortController();
    const turn = await session.startTurn({ prompt, signal: abort.signal });
    const events: TurnEvent[] = [];
    const finished = (async () => {
        for await (const event of turn.events) {
            events.push(event);
        }
        return events;
    })();
    return {
        abort,
        events,
        finished,
        settle: () => turn.settle(),
        turnId: fake.lastTurnId,
        unconsumedSteers: () => turn.unconsumedSteers(),
    };
}

/** A fresh session on a fake with one turn already started. */
export async function runningFakeTurn() {
    const { fake, session } = await openFake();
    const turn = await startFakeTurn(fake, session);
    turnStarted(fake, turn.turnId);
    return { fake, session, turn };
}

/** Lets queued microtasks and fake replies run. */
export async function flush(): Promise<void> {
    for (let index = 0; index < 5; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

/** Non-liveness events, as compact labels. */
export function labels(events: readonly TurnEvent[]): string[] {
    return events.flatMap((event) => {
        switch (event.type) {
            case 'progress':
                return [];
            case 'tool-call':
            case 'tool-result':
            case 'tool-error':
                return [`${event.type}:${event.toolName}`];
            case 'text-delta':
            case 'reasoning-delta':
                return [`${event.type}:${event.text}`];
            case 'error':
                return [
                    `error:${event.error instanceof Error ? event.error.message : String(event.error)}`,
                ];
            case 'session-failure':
                return [`session-failure:${event.severity}:${event.category}:${event.title}`];
            default:
                return [event.type];
        }
    });
}

/** Emits a notification for the given turn of the fake's thread. */
export function emitTurn(fake: FakeAppServer, turnId: string, method: string, params: object = {}) {
    fake.notify(method, { turnId, ...params });
}

export function turnStarted(fake: FakeAppServer, turnId: string) {
    fake.notify('turn/started', { turn: { id: turnId, status: 'inProgress' } });
}

export function turnCompleted(
    fake: FakeAppServer,
    turnId: string,
    status: 'completed' | 'failed' | 'interrupted' = 'completed',
    error: { message: string } | null = null
) {
    fake.notify('turn/completed', { turn: { error, id: turnId, status } });
}

export function usage(fake: FakeAppServer, turnId: string, input = 100, output = 10, cached = 0) {
    const breakdown = {
        cachedInputTokens: cached,
        inputTokens: input,
        outputTokens: output,
        totalTokens: input + output,
    };
    emitTurn(fake, turnId, 'thread/tokenUsage/updated', {
        tokenUsage: { last: breakdown, total: breakdown },
    });
}
