import type { RuntimeSession, RuntimeTurn, SteerResult } from '../driver.ts';
import type { CodexResumeState } from '../resume-state.ts';
import type { CodexAppServer } from './app-server.ts';
import type { CodexInbound } from './codex-connection.ts';
import { turnStartResultSchema, userMessageText } from './protocol.ts';
import { CodexTurnNormalizer } from './turn-normalizer.ts';
import { CodexTurnRouter } from './turn-router.ts';
import { CodexTurnRun } from './turn-run.ts';
import { CodexUsageLedger } from './turn-usage.ts';

/** How long a steer waits for the turn to start or a post-tool gate to reopen. */
const STEER_WAIT_MS = 15_000;

/**
 * Per-turn settings every `turn/start` carries. App-server turns default to no reasoning
 * summary, so the model's reasoning never reached Activity or the journal; codex-acp asked for
 * `auto` on every turn.
 */
export const codexTurnParams = { summary: 'auto' } as const;

/**
 * One Worker's live Codex thread on its own app-server. A turn is `turn/start`, ending at
 * `turn/completed`; busy delivery is `turn/steer` with the expected turn id, only after
 * `turn/started` and never right after a tool finishes (Raft #238); Stop is `turn/interrupt`.
 */
export class CodexSession implements RuntimeSession {
    readonly isResume: boolean;
    readonly sessionId: string;
    private active: CodexTurnRun | null = null;
    /** Delivered steers not yet seen as a `userMessage` item, per turn. */
    private steered: Array<{ readonly run: CodexTurnRun; readonly text: string }> = [];
    private readonly router: CodexTurnRouter;

    constructor(
        readonly server: CodexAppServer,
        /** Ends the app-server for good; it is never reused. */
        private readonly release: () => Promise<void>,
        workspaceDir: string
    ) {
        this.sessionId = server.threadId;
        this.isResume = server.resumed;
        this.router = new CodexTurnRouter(
            server.threadId,
            new CodexTurnNormalizer({ hostToolServer: null, workspaceDir }, new CodexUsageLedger())
        );
        server.route(
            (message) => {
                this.noteConsumedSteer(message);
                this.router.receive(message);
            },
            (line) =>
                this.active?.push([
                    { nativeType: `codex_invalid_line:${line.slice(0, 80)}`, type: 'progress' },
                ])
        );
        void server.connection.exited.then((error) => this.active?.end([{ error, type: 'error' }]));
    }

    async startTurn(options: { prompt: string; signal: AbortSignal }): Promise<RuntimeTurn> {
        if (this.active && !this.active.isEnded) {
            throw new Error('A Codex turn is already running on this session.');
        }
        const run = new CodexTurnRun();
        this.steered = [];
        options.signal.throwIfAborted();
        this.active = run;
        this.router.attach(run);
        let result: unknown;
        try {
            result = await this.server.connection.request('turn/start', {
                ...codexTurnParams,
                input: [{ text: options.prompt, text_elements: [], type: 'text' }],
                threadId: this.sessionId,
            });
        } catch (error) {
            run.end([]);
            this.active = null;
            throw error;
        }
        const accepted = turnStartResultSchema.safeParse(result);
        if (accepted.success) {
            this.router.accepted(run, accepted.data.turn.id);
        } else {
            run.end([
                { error: new Error('Codex accepted the turn without a turn id.'), type: 'error' },
            ]);
        }
        const onAbort = () => void this.interrupt(run);
        options.signal.addEventListener('abort', onAbort, { once: true });
        void run.idle.then(() => options.signal.removeEventListener('abort', onAbort));
        if (options.signal.aborted) {
            onAbort();
        }
        return {
            events: run.events(),
            settle: () => run.idle,
            unconsumedSteers: () =>
                this.steered.filter((steer) => steer.run === run).map((steer) => steer.text),
        };
    }

    async steer(text: string): Promise<SteerResult> {
        const run = this.active;
        if (!run || run.isEnded) {
            return { delivered: false, reason: 'idle' };
        }
        const state = await run.whenSteerable(STEER_WAIT_MS);
        if (state === 'ended') {
            return { delivered: false, reason: 'idle' };
        }
        if (state === 'timeout' || run.turnId === null) {
            return {
                delivered: false,
                error: new Error('The Codex turn did not reach a steerable point.'),
                reason: 'failed',
            };
        }
        try {
            await this.server.connection.request('turn/steer', {
                expectedTurnId: run.turnId,
                input: [{ text, text_elements: [], type: 'text' }],
                threadId: this.sessionId,
            });
            this.steered.push({ run, text });
            return { delivered: true };
        } catch (error) {
            return run.isEnded
                ? { delivered: false, reason: 'idle' }
                : { delivered: false, error, reason: 'failed' };
        }
    }

    async stop() {
        await this.active?.idle;
        await this.release();
        return {
            runtime: 'codex',
            threadId: this.sessionId,
            version: 1,
        } satisfies CodexResumeState;
    }

    async destroy() {
        await this.release();
    }

    /**
     * Codex records accepted steering as a `userMessage` item once the model's next request
     * carries it; a steer with no such item by turn end never reached the model.
     */
    private noteConsumedSteer(message: CodexInbound) {
        const text = message.kind === 'notification' ? userMessageText(message) : null;
        const index =
            text === null
                ? -1
                : this.steered.findIndex(
                      (steer) => steer.run === this.active && steer.text === text
                  );
        if (index >= 0) {
            this.steered.splice(index, 1);
        }
    }

    private async interrupt(run: CodexTurnRun) {
        if (run.isEnded || run.abortRequested) {
            return;
        }
        run.abortRequested = true;
        const turnId = await run.acceptedTurnId();
        if (turnId === null || run.isEnded) {
            return;
        }
        try {
            await this.server.connection.request('turn/interrupt', {
                threadId: this.sessionId,
                turnId,
            });
        } catch (error) {
            run.end([{ error, type: 'error' }]);
        }
    }
}
