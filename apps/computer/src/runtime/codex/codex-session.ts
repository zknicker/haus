import type { RuntimeSession, RuntimeTurn, SteerResult } from '../driver.ts';
import type { CodexResumeState } from '../resume-state.ts';
import type { CodexAppServer } from './app-server.ts';
import { turnStartResultSchema } from './protocol.ts';
import { CodexTurnNormalizer } from './turn-normalizer.ts';
import { CodexTurnRouter } from './turn-router.ts';
import { CodexTurnRun } from './turn-run.ts';
import { CodexUsageLedger } from './turn-usage.ts';

/** How long a steer waits for the turn to start or a post-tool gate to reopen. */
const STEER_WAIT_MS = 15_000;

export interface CodexSessionHooks {
    /** Parks the live app-server for the next open of the same thread. */
    park(session: CodexSession): void;
    /** Ends the app-server for good; it is never reused. */
    release(session: CodexSession): Promise<void>;
}

/**
 * One Agent's live Codex thread on its own app-server. A turn is `turn/start`, ending at
 * `turn/completed`; busy delivery is `turn/steer` with the expected turn id, only after
 * `turn/started` and never right after a tool finishes (Raft #238); Stop is `turn/interrupt`.
 */
export class CodexSession implements RuntimeSession {
    readonly sessionId: string;
    private active: CodexTurnRun | null = null;
    private readonly router: CodexTurnRouter;
    private hostToolsChecked = false;
    private resumed: boolean;

    constructor(
        readonly server: CodexAppServer,
        private readonly hooks: CodexSessionHooks,
        workspaceDir: string
    ) {
        this.sessionId = server.threadId;
        this.resumed = server.resumed;
        this.router = new CodexTurnRouter(
            server.threadId,
            new CodexTurnNormalizer(
                { hostToolServer: server.hostTools.mcp.name, workspaceDir },
                new CodexUsageLedger()
            )
        );
        server.route(
            (message) => this.router.receive(message),
            (line) =>
                this.active?.push([
                    { nativeType: `codex_invalid_line:${line.slice(0, 80)}`, type: 'progress' },
                ])
        );
        void server.connection.exited.then((error) => this.active?.end([{ error, type: 'error' }]));
    }

    get alive(): boolean {
        return this.server.connection.alive;
    }

    get isResume(): boolean {
        return this.resumed;
    }

    /** A parked session taken up by a later open resumes its thread on the same process. */
    reopen(): this {
        this.resumed = true;
        return this;
    }

    async startTurn(options: { prompt: string; signal: AbortSignal }): Promise<RuntimeTurn> {
        if (this.active && !this.active.isEnded) {
            throw new Error('A Codex turn is already running on this session.');
        }
        const run = new CodexTurnRun();
        const warning = await this.hostToolsWarning();
        options.signal.throwIfAborted();
        this.active = run;
        this.router.attach(run);
        run.push(warning);
        let result: unknown;
        try {
            result = await this.server.connection.request('turn/start', {
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
        return { events: run.events(), settle: () => run.idle };
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
            return { delivered: true };
        } catch (error) {
            return run.isEnded
                ? { delivered: false, reason: 'idle' }
                : { delivered: false, error, reason: 'failed' };
        }
    }

    async detach(): Promise<CodexResumeState> {
        await this.active?.idle;
        if (this.alive) {
            this.hooks.park(this);
        }
        return this.resumeState();
    }

    async stop(): Promise<CodexResumeState> {
        await this.active?.idle;
        await this.hooks.release(this);
        return this.resumeState();
    }

    async destroy(): Promise<void> {
        await this.hooks.release(this);
    }

    private resumeState(): CodexResumeState {
        return { runtime: 'codex', threadId: this.sessionId, version: 1 };
    }

    /** The first turn waits for the host-tool MCP server and reports when it never came up. */
    private async hostToolsWarning() {
        if (this.hostToolsChecked) {
            return [];
        }
        this.hostToolsChecked = true;
        const status = await this.server.hostToolsReady;
        return status.ok
            ? []
            : [
                  {
                      category: 'host-tools',
                      severity: 'warning' as const,
                      title: `Haus host tools are unavailable to Codex: ${status.error}`,
                      type: 'session-failure' as const,
                  },
              ];
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
