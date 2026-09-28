/** How many of a run's shown lines in one Chat ride along as its previous status. */
export const thoughtPreviousLineCount = 2;
/** A run's lines in a Chat are forgotten once nothing new has shown there for this long. */
export const thoughtPreviousLineTtlMs = 10 * 60_000;

/** One run's thoughts as announced to one Chat. */
export interface ThoughtLineScope {
    chatId: string;
    computerId: string;
    runId: string;
}

/**
 * The last lines each run showed in each Chat (ADR 0036), so the summarizer can
 * say what is new instead of repeating itself. In memory only, like the
 * Server's spacing guard: nothing is persisted, and a restart forgets them.
 */
export interface ThoughtPreviousLines {
    /** The scope's last shown lines, oldest first; empty before its first. */
    read(scope: ThoughtLineScope): readonly string[];
    remember(scope: ThoughtLineScope, text: string): void;
}

export function createThoughtPreviousLines(now: () => number = Date.now): ThoughtPreviousLines {
    const lines = new Map<string, { at: number; texts: readonly string[] }>();
    return {
        read(scope) {
            const entry = lines.get(scopeKey(scope));
            return entry && now() - entry.at < thoughtPreviousLineTtlMs ? entry.texts : [];
        },
        remember(scope, text) {
            const at = now();
            // Finished runs are never announced to again; their entries expire here.
            for (const [key, entry] of lines) {
                if (at - entry.at >= thoughtPreviousLineTtlMs) {
                    lines.delete(key);
                }
            }
            const key = scopeKey(scope);
            const texts = [...(lines.get(key)?.texts ?? []), text].slice(-thoughtPreviousLineCount);
            lines.set(key, { at, texts });
        },
    };
}

function scopeKey(scope: ThoughtLineScope): string {
    return `${scope.computerId}:${scope.runId}:${scope.chatId}`;
}
