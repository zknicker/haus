import type { ClaudeConnection } from './claude-connection.ts';

/**
 * Parked `claude` processes, keyed by the conversation each is writing. A detached session
 * leaves its process here so the next turn's `openSession` continues it without a spawn; a
 * process that exits while parked leaves the pool, and the next open resumes it cold.
 */
export interface ClaudeWarmPool {
    park(connection: ClaudeConnection): void;
    readonly size: number;
    /** Removes and returns the parked process for `sessionId`, if any. */
    take(sessionId: string): ClaudeConnection | undefined;
}

export function createClaudeWarmPool(): ClaudeWarmPool {
    const parked = new Map<string, ClaudeConnection>();
    return {
        park(connection) {
            if (!connection.alive) {
                return;
            }
            const id = connection.sessionId;
            const previous = parked.get(id);
            if (previous && previous !== connection) {
                // Two live processes must never write one conversation.
                void previous.stop().catch(() => undefined);
            }
            parked.set(id, connection);
            void connection.process.exited.then(() => {
                if (parked.get(id) === connection) {
                    parked.delete(id);
                }
            });
        },
        get size() {
            return parked.size;
        },
        take(sessionId) {
            const connection = parked.get(sessionId);
            parked.delete(sessionId);
            return connection?.alive ? connection : undefined;
        },
    };
}

/** Computer-wide: one Agent's next turn finds the process its last turn parked. */
export const claudeWarmPool: ClaudeWarmPool = createClaudeWarmPool();
