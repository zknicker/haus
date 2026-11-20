import type { TurnEvent } from '../turn-event.ts';

/**
 * One running Codex turn: an event queue its consumer drains, plus the facts steering and
 * interruption wait on. Events end after the settlement the session pushes with `end`.
 */
export class CodexTurnRun {
    turnId: string | null = null;
    started = false;
    /** A tool just finished; a steer now can crash the turn (Raft #238). */
    gated = false;
    abortRequested = false;
    private ended = false;
    private readonly queue: TurnEvent[] = [];
    private wake: (() => void) | null = null;
    private readonly changed = new Set<() => void>();
    private readonly done = Promise.withResolvers<void>();

    get isEnded(): boolean {
        return this.ended;
    }

    /** Resolves once the turn reached Codex's idle boundary (or the app-server is gone). */
    get idle(): Promise<void> {
        return this.done.promise;
    }

    push(events: readonly TurnEvent[]): void {
        if (this.ended || events.length === 0) {
            return;
        }
        this.queue.push(...events);
        this.notify();
    }

    end(events: readonly TurnEvent[]): void {
        if (this.ended) {
            return;
        }
        this.queue.push(...events);
        this.ended = true;
        this.done.resolve();
        this.notify();
    }

    update(change: { gated?: boolean; started?: boolean; turnId?: string }): void {
        if (change.turnId !== undefined) {
            this.turnId = change.turnId;
        }
        if (change.started !== undefined) {
            this.started = change.started;
        }
        if (change.gated !== undefined) {
            this.gated = change.gated;
        }
        this.notify();
    }

    /**
     * Waits until a steer is safe: the turn has started and no tool just finished. `ended` when
     * the turn finished first; `timeout` when the gate stayed shut.
     */
    async whenSteerable(timeoutMs: number): Promise<'ended' | 'ready' | 'timeout'> {
        const state = () => {
            if (this.ended) {
                return 'ended' as const;
            }
            return this.started && this.turnId !== null && !this.gated ? ('ready' as const) : null;
        };
        const now = state();
        if (now) {
            return now;
        }
        return await new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.changed.delete(check);
                resolve('timeout');
            }, timeoutMs);
            const check = () => {
                const next = state();
                if (next) {
                    clearTimeout(timer);
                    this.changed.delete(check);
                    resolve(next);
                }
            };
            this.changed.add(check);
        });
    }

    /** Resolves with the turn id once Codex accepted the turn; `null` if it ended first. */
    async acceptedTurnId(): Promise<string | null> {
        while (this.turnId === null && !this.ended) {
            await new Promise<void>((resolve) => {
                const check = () => {
                    this.changed.delete(check);
                    resolve();
                };
                this.changed.add(check);
            });
        }
        return this.turnId;
    }

    async *events(): AsyncGenerator<TurnEvent> {
        while (true) {
            const next = this.queue.shift();
            if (next) {
                yield next;
                continue;
            }
            if (this.ended) {
                return;
            }
            await new Promise<void>((resolve) => {
                this.wake = resolve;
            });
        }
    }

    private notify() {
        const wake = this.wake;
        this.wake = null;
        wake?.();
        for (const listener of [...this.changed]) {
            listener();
        }
    }
}
