import type { RuntimeSession, RuntimeTurn, SteerResult } from '../driver.ts';
import type { ClaudeConnection } from './claude-connection.ts';
import { claudeResumeState } from './claude-resume.ts';
import { ClaudeTurn } from './claude-turn.ts';

export interface ClaudeSessionDeps {
    connection: ClaudeConnection;
    isResume: boolean;
    /** Resumes the conversation in a new process when this one died between turns. */
    relaunch(claudeSessionId: string): Promise<ClaudeConnection>;
}

/**
 * The live Claude Code session: one process, turns run on it one at a time. `stop` and
 * `destroy` end it.
 */
export function createClaudeSession(deps: ClaudeSessionDeps): RuntimeSession {
    let connection = deps.connection;
    let turn: ClaudeTurn | null = null;
    let closed = false;
    return {
        async destroy() {
            closed = true;
            await connection.stop();
        },
        isResume: deps.isResume,
        get sessionId() {
            return connection.sessionId;
        },
        async startTurn({ prompt, signal }): Promise<RuntimeTurn> {
            if (closed) {
                throw new Error('The Claude Code session is stopped.');
            }
            if (turn && !turn.isSettled) {
                throw new Error('A Claude Code turn is already running.');
            }
            if (!connection.alive) {
                connection = await deps.relaunch(connection.sessionId);
            }
            const next = new ClaudeTurn(connection, { signal });
            turn = next;
            await next.start(prompt);
            return {
                events: next.events,
                settle: () => next.settle(),
                unconsumedSteers: () => next.unconsumedSteers(),
            };
        },
        steer(text): Promise<SteerResult> {
            if (!turn || turn.isSettled) {
                return Promise.resolve({ delivered: false, reason: 'idle' });
            }
            return turn.steer(text);
        },
        async stop() {
            await turn?.settle();
            turn = null;
            closed = true;
            await connection.stop();
            return claudeResumeState(connection.sessionId);
        },
    };
}
