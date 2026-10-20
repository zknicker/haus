import type { RuntimeSession, RuntimeTurn, SteerResult } from '../driver.ts';
import type { RuntimeResumeState } from '../resume-state.ts';
import { GROK_CREDENTIAL_REFRESH_WINDOW_MS } from './grok-auth.ts';
import { closeGrokLive, type GrokLive } from './grok-live.ts';
import { grokResumeState } from './grok-resume.ts';
import { GrokTurn } from './grok-turn.ts';
import { createGrokTurnNormalizer } from './grok-turn-normalizer.ts';
import { parkWarm } from './grok-warm-pool.ts';
import { AcpRequestError, jsonRpcMethodNotFound } from './json-rpc.ts';

/** Re-launches the same Grok session in a fresh process (`session/load`). */
export type GrokRelaunch = (previous: GrokLive) => Promise<GrokLive>;

/**
 * One live Grok session. Turns run one at a time; `steer` interjects into the running one.
 * `detach` parks the process warm for the next turn, `stop` and `destroy` end it.
 */
export class GrokSession implements RuntimeSession {
    readonly isResume: boolean;
    private turn: GrokTurn | null = null;
    private ended = false;

    constructor(
        private live: GrokLive,
        private readonly relaunch: GrokRelaunch,
        options: { isResume: boolean }
    ) {
        this.isResume = options.isResume;
    }

    get sessionId(): string {
        return this.live.sessionId;
    }

    async startTurn(options: { prompt: string; signal: AbortSignal }): Promise<RuntimeTurn> {
        if (this.ended) {
            throw new Error('The Grok session has ended.');
        }
        if (this.turn && !this.turn.settled) {
            throw new Error('A Grok turn is already running on this session.');
        }
        // A process that died between turns, or a launch credential about to expire, reloads the
        // same session in a fresh process before the prompt.
        if (this.live.process.connection.closed || credentialExpiring(this.live)) {
            this.live = await this.relaunch(this.live);
        }
        const live = this.live;
        const turn = new GrokTurn({
            connection: live.process.connection,
            normalizer: createGrokTurnNormalizer({
                hostServerName: live.hostServerName,
                paths: live.paths,
                sessionId: live.sessionId,
            }),
            prompt: options.prompt,
            sessionId: live.sessionId,
            signal: options.signal,
        });
        this.turn = turn;
        live.turnRunning = true;
        void turn.settle().then(() => {
            live.turnRunning = false;
        });
        return turn.begin();
    }

    async steer(text: string): Promise<SteerResult> {
        const turn = this.turn;
        if (!turn || turn.settled) {
            return { delivered: false, reason: 'idle' };
        }
        // Like the harness: an interjection waits until Grok is streaming the prompt.
        await turn.started;
        if (turn.settled) {
            return { delivered: false, reason: 'idle' };
        }
        try {
            await this.live.process.connection.request('_x.ai/interject', {
                sessionId: this.live.sessionId,
                text,
            });
            return { delivered: true };
        } catch (error) {
            if (error instanceof AcpRequestError && error.code === jsonRpcMethodNotFound) {
                return { delivered: false, reason: 'unsupported' };
            }
            return turn.settled
                ? { delivered: false, reason: 'idle' }
                : { delivered: false, error, reason: 'failed' };
        }
    }

    async detach(): Promise<RuntimeResumeState> {
        await this.turn?.settle();
        this.ended = true;
        if (this.live.process.connection.closed) {
            this.live.hostTools.close();
        } else {
            await parkWarm(this.live);
        }
        return grokResumeState(this.live.sessionId);
    }

    async stop(): Promise<RuntimeResumeState> {
        await this.turn?.settle();
        this.ended = true;
        await closeGrokLive(this.live);
        return grokResumeState(this.live.sessionId);
    }

    async destroy(): Promise<void> {
        this.ended = true;
        await closeGrokLive(this.live);
    }
}

function credentialExpiring(live: GrokLive): boolean {
    return (
        live.credential.kind === 'subscription' &&
        live.credential.expiresAt <= Date.now() + GROK_CREDENTIAL_REFRESH_WINDOW_MS
    );
}
