import {
    type ClaudeUsageOptions,
    ClaudeUsageRequestError,
    type ClaudeUsageSnapshot,
    getClaudeUsage,
} from '@haus/claude-usage';
import {
    readClaudePlanUsageState,
    saveClaudePlanUsageSnapshot,
    scheduleClaudeUsageFallback,
} from './claude-plan-usage-state.ts';

const DEFAULT_REFRESH_INTERVAL_MS = 15 * 60_000;
const DEFAULT_FALLBACK_DELAY_MS = 60 * 60_000;
const MAX_FALLBACK_DELAY_MS = 24 * 60 * 60_000;

export interface ClaudePlanUsageReadOptions extends ClaudeUsageOptions {
    dataRoot?: string;
    /**
     * A user-initiated refresh makes one attempt past the guarded fallback
     * backoff. Fresh evidence still short-circuits the read, and a failed
     * forced attempt re-arms the backoff.
     */
    force?: boolean;
}

/**
 * The reader owns freshness and the durable fallback backoff, not retention: a
 * failed read throws so the aggregate Computer usage cache can decide whether
 * last-known numbers are still worth showing, and say why. Only a persisted
 * snapshot that is still fresh short-circuits a provider call.
 */
export function createClaudePlanUsageReader(
    options: {
        fallbackDelayMs?: number;
        load?: (options: ClaudeUsageOptions) => Promise<ClaudeUsageSnapshot>;
        maxFallbackDelayMs?: number;
        refreshIntervalMs?: number;
    } = {}
) {
    const load = options.load ?? getClaudeUsage;
    const refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;
    const fallbackDelayMs = options.fallbackDelayMs ?? DEFAULT_FALLBACK_DELAY_MS;
    const maxFallbackDelayMs = options.maxFallbackDelayMs ?? MAX_FALLBACK_DELAY_MS;
    let lastError: unknown = null;
    let lastSnapshot: ClaudeUsageSnapshot | null = null;
    let nextRequestAt = 0;
    let pending: Promise<ClaudeUsageSnapshot> | null = null;

    return async (readOptions: ClaudePlanUsageReadOptions = {}): Promise<ClaudeUsageSnapshot> => {
        const now = readOptions.now ?? new Date();
        const force = readOptions.force === true;
        const isFresh = (candidate: ClaudeUsageSnapshot) =>
            now.getTime() - Date.parse(candidate.capturedAt) < refreshIntervalMs;
        if (readOptions.dataRoot) {
            const state = await readClaudePlanUsageState(readOptions.dataRoot);
            if (state.snapshot && isFresh(state.snapshot)) {
                return state.snapshot;
            }
            if (!force && now.getTime() < state.nextFallbackAt) {
                throw new ClaudeUsageRequestError(
                    'Claude plan usage is waiting for its guarded fallback retry.',
                    429,
                    state.nextFallbackAt - now.getTime()
                );
            }
        } else if (lastSnapshot && isFresh(lastSnapshot)) {
            return lastSnapshot;
        } else if (lastError && !force && now.getTime() < nextRequestAt) {
            throw lastError;
        }
        if (pending) {
            return pending;
        }

        pending = (async () => {
            const dataRoot = readOptions.dataRoot;
            const state = dataRoot ? await readClaudePlanUsageState(dataRoot) : null;
            if (dataRoot) {
                await scheduleClaudeUsageFallback(
                    dataRoot,
                    now.getTime() + refreshIntervalMs,
                    false
                );
            }
            try {
                const snapshot = await load(readOptions);
                lastError = null;
                lastSnapshot = snapshot;
                nextRequestAt = now.getTime() + refreshIntervalMs;
                if (dataRoot) {
                    await saveClaudePlanUsageSnapshot(dataRoot, snapshot, refreshIntervalMs);
                }
                return snapshot;
            } catch (error) {
                lastError = error;
                if (!(dataRoot || isTransientFailure(error))) {
                    nextRequestAt = 0;
                    throw error;
                }
                const failures = (state?.fallbackFailures ?? 0) + 1;
                const exponentialDelay = Math.min(
                    maxFallbackDelayMs,
                    fallbackDelayMs * 2 ** Math.min(failures - 1, 10)
                );
                const retryAfter =
                    error instanceof ClaudeUsageRequestError && error.retryAfterMs !== null
                        ? error.retryAfterMs
                        : 0;
                const delay = Math.max(exponentialDelay, retryAfter, refreshIntervalMs);
                nextRequestAt = now.getTime() + delay;
                if (dataRoot) {
                    await scheduleClaudeUsageFallback(dataRoot, nextRequestAt, true);
                }
                throw error;
            } finally {
                pending = null;
            }
        })();
        return pending;
    };
}

export const readClaudePlanUsage = createClaudePlanUsageReader();

function isTransientFailure(error: unknown): boolean {
    return (
        error instanceof TypeError ||
        (error instanceof ClaudeUsageRequestError && (error.status === 429 || error.status >= 500))
    );
}
