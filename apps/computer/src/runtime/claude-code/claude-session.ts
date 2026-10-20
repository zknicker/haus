import type { RuntimeSession, RuntimeTurn, SteerResult } from '../driver.ts';
import type { RuntimeResumeState } from '../resume-state.ts';
import type { ClaudeConnection } from './claude-connection.ts';
import { claudeResumeState } from './claude-resume.ts';
import { ClaudeTurn } from './claude-turn.ts';
import type { ClaudeWarmPool } from './claude-warm-pool.ts';

export interface ClaudeSessionDeps {
    collectPlanUsage: boolean;
    connection: ClaudeConnection;
    isResume: boolean;
    pool: ClaudeWarmPool;
    /** Resumes the conversation in a new process when this one died between turns. */
    relaunch(claudeSessionId: string): Promise<ClaudeConnection>;
}

/**
 * The live Claude Code session: one long-lived process, turns run on it one at a time.
 * `detach` parks the process warm for the next turn; `stop` and `destroy` end it.
 */
export function createClaudeSession(deps: ClaudeSessionDeps): RuntimeSession {
    let connection = deps.connection;
    let turn: ClaudeTurn | null = null;
    let closed = false;
    const idle = async () => {
        await turn?.settle();
        turn = null;
    };
    return {
        async destroy() {
            closed = true;
            await connection.stop();
        },
        async detach(): Promise<RuntimeResumeState> {
            await idle();
            closed = true;
            deps.pool.park(connection);
            return claudeResumeState(connection.sessionId);
        },
        isResume: deps.isResume,
        get sessionId() {
            return connection.sessionId;
        },
        async startTurn({ prompt, signal }): Promise<RuntimeTurn> {
            if (closed) {
                throw new Error('The Claude Code session is parked.');
            }
            if (turn && !turn.isSettled) {
                throw new Error('A Claude Code turn is already running.');
            }
            if (!connection.alive) {
                connection = await deps.relaunch(connection.sessionId);
            }
            const next = new ClaudeTurn(connection, {
                collectPlanUsage: deps.collectPlanUsage,
                signal,
            });
            turn = next;
            await next.start(prompt);
            return { events: next.events, settle: () => next.settle() };
        },
        steer(text): Promise<SteerResult> {
            if (!turn || turn.isSettled) {
                return Promise.resolve({ delivered: false, reason: 'idle' });
            }
            return turn.steer(text);
        },
        async stop(): Promise<RuntimeResumeState> {
            await idle();
            closed = true;
            await connection.stop();
            return claudeResumeState(connection.sessionId);
        },
    };
}
