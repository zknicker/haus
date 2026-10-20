import type { TurnEvent } from '../turn-event.ts';
import type { CodexInbound } from './codex-connection.ts';
import { CodexTurnFailedError } from './codex-errors.ts';
import { notificationThreadId } from './protocol.ts';
import type { CodexTurnEnd, CodexTurnNormalizer } from './turn-normalizer.ts';
import type { CodexTurnRun } from './turn-run.ts';

/** How long a turn may sit in `systemError` without `turn/completed` before it fails. */
const SYSTEM_ERROR_GRACE_MS = 5000;

/**
 * Routes the session thread's notifications into the running turn. Secondary threads are
 * ignored; a notification naming another turn is stale. Until Codex names the new turn, a
 * turn-scoped notification waits: a resumed app-server re-sends the previous turn's usage
 * right after `turn/start`, under the previous turn's id.
 */
export class CodexTurnRouter {
    private run: CodexTurnRun | null = null;
    private held: Array<{ method: string; params: unknown; turnId: string }> = [];
    private systemErrorTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(
        private readonly threadId: string,
        private readonly normalizer: CodexTurnNormalizer
    ) {}

    attach(run: CodexTurnRun): void {
        this.run = run;
        this.held = [];
        this.normalizer.beginTurn();
        void run.idle.then(() => clearTimeout(this.systemErrorTimer));
    }

    /** Codex accepted the turn under `turnId`; held notifications for it now apply. */
    accepted(run: CodexTurnRun, turnId: string): void {
        if (run !== this.run || run.turnId !== null) {
            return;
        }
        run.update({ turnId });
        const held = this.held;
        this.held = [];
        for (const message of held) {
            if (message.turnId === turnId) {
                this.apply(run, message.method, message.params);
            }
        }
    }

    receive(message: CodexInbound): void {
        const run = this.run;
        if (message.kind === 'foreign') {
            run?.push([{ error: foreignError(message.value), type: 'error' }]);
            return;
        }
        const threadId = notificationThreadId(message.params);
        if (threadId !== undefined && threadId !== this.threadId) {
            return;
        }
        if (!run || run.isEnded) {
            // Between turns only usage matters: it lets the next turn spot a re-sent total.
            if (message.method === 'thread/tokenUsage/updated') {
                this.normalizer.normalize(message.method, message.params);
            }
            return;
        }
        const turnId = paramTurnId(message.params);
        if (turnId !== undefined && run.turnId === null && message.method !== 'turn/started') {
            this.held.push({ method: message.method, params: message.params, turnId });
            run.push([{ nativeType: message.method, type: 'progress' }]);
            return;
        }
        if (turnId !== undefined && run.turnId !== null && turnId !== run.turnId) {
            run.push([{ nativeType: `${message.method}:stale`, type: 'progress' }]);
            return;
        }
        this.apply(run, message.method, message.params);
    }

    private apply(run: CodexTurnRun, method: string, params: unknown) {
        const result = this.normalizer.normalize(method, params);
        if (result.turnStarted) {
            this.accepted(run, result.turnStarted);
            run.update({ started: true });
        }
        if (result.toolBoundary) {
            run.update({ gated: true });
        } else if (result.progress) {
            run.update({ gated: false });
        }
        run.push(result.events);
        if (result.systemError !== undefined) {
            const message = result.systemError;
            clearTimeout(this.systemErrorTimer);
            this.systemErrorTimer = setTimeout(
                () => run.end([{ error: new CodexTurnFailedError(message), type: 'error' }]),
                SYSTEM_ERROR_GRACE_MS
            );
        }
        if (result.end) {
            run.end(this.settlement(run, result.end));
        }
    }

    private settlement(run: CodexTurnRun, end: CodexTurnEnd): TurnEvent[] {
        const finish: TurnEvent = {
            claudePlanUsage: null,
            type: 'turn-finish',
            usage: this.normalizer.usageForTurn(),
        };
        const failed = (message: string): TurnEvent => ({
            error: new CodexTurnFailedError(message),
            type: 'error',
        });
        switch (end.kind) {
            case 'completed':
                return this.normalizer.hadEvidence
                    ? [finish]
                    : [
                          failed(
                              'Codex runtime completed without a response. Please retry. (codex_zero_evidence_turn_completed)'
                          ),
                      ];
            case 'failed':
                return [finish, failed(end.message)];
            default:
                return run.abortRequested
                    ? [finish, { type: 'abort' }]
                    : [
                          finish,
                          failed(`Codex turn interrupted${end.message ? `: ${end.message}` : ''}`),
                      ];
        }
    }
}

function paramTurnId(params: unknown): string | undefined {
    if (typeof params !== 'object' || params === null) {
        return;
    }
    const record = params as { turn?: { id?: unknown }; turnId?: unknown };
    if (typeof record.turnId === 'string') {
        return record.turnId;
    }
    return typeof record.turn?.id === 'string' ? record.turn.id : undefined;
}

/** The CLI's own `{ type: 'error' }` or `turn.failed` line (a capacity error, for one). */
function foreignError(value: Record<string, unknown>): Error {
    const nested = value.error as { message?: unknown } | undefined;
    const message =
        (typeof value.message === 'string' && value.message) ||
        (typeof nested?.message === 'string' && nested.message) ||
        'Codex runtime failed.';
    return new CodexTurnFailedError(message);
}
