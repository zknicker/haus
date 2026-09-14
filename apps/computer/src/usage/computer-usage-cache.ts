import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { type UsageOverview, type UsageStale, usageOverviewSchema } from '@haus/api';
import { readComputerUsage } from './read-usage.ts';
import { createUsageFailureReporter, type UsageFailureLog } from './usage-failure.ts';

const DEFAULT_REFRESH_INTERVAL_MS = 15 * 60_000;

type ProviderUsageState = UsageOverview['claude'] | UsageOverview['codex'] | UsageOverview['grok'];

interface PendingRead {
    forced: boolean;
    promise: Promise<UsageOverview>;
    token: symbol;
}

/**
 * The one place that decides a provider's last good snapshot is still worth
 * showing. Provider readers throw; this cache substitutes the retained snapshot
 * and stamps `stale` with the failure that kept it, so the App can tell an
 * expired login apart from ordinary out-of-date numbers.
 */
export function createComputerUsageCache(options: {
    dataRoot: string;
    load?: typeof readComputerUsage;
    logUsageFailure?: UsageFailureLog;
    logUsageRecovery?: (provider: string) => void;
    refreshIntervalMs?: number;
}) {
    const cachePath = join(options.dataRoot, 'usage-cache.json');
    const load = options.load ?? readComputerUsage;
    const refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;
    const failures = createUsageFailureReporter({
        log: options.logUsageFailure,
        logRecovery: options.logUsageRecovery,
    });
    let cached: UsageOverview | null = null;
    let cacheLoad: Promise<UsageOverview | null> | null = null;
    let pending: PendingRead | null = null;

    return async (
        readOptions: Parameters<typeof readComputerUsage>[0] = {},
        mode: 'cached' | 'refresh' = 'cached'
    ): Promise<UsageOverview> => {
        cacheLoad ??= readUsageCache(cachePath);
        cached ??= await cacheLoad;
        const now = readOptions.now?.() ?? new Date();
        if (
            mode === 'cached' &&
            cached &&
            now.getTime() - Date.parse(cached.capturedAt) < refreshIntervalMs
        ) {
            return cached;
        }
        const forced = mode === 'refresh';
        if (pending && (pending.forced || !forced)) {
            return pending.promise;
        }

        // A forced refresh never joins an unforced read already in flight: that
        // read asked its providers to respect the guarded backoff, which is the
        // one thing the operator pressed Refresh to get past. It queues behind
        // it instead, so the forced attempt still happens.
        const queued = pending?.promise ?? null;
        const token = Symbol('usage-read');
        const run = async (): Promise<UsageOverview> => {
            try {
                if (queued) {
                    await Promise.allSettled([queued]);
                }
                const current = await load({
                    ...readOptions,
                    dataRoot: options.dataRoot,
                    force: forced,
                    logUsageFailure: readOptions.logUsageFailure ?? failures.log,
                    now: () => now,
                });
                cached = retainProviderSnapshots(current, cached);
                await writeUsageCache(cachePath, cached);
                return cached;
            } catch (error) {
                if (cached) {
                    return cached;
                }
                throw error;
            } finally {
                // The pass closes even when the read as a whole rejected.
                // Leaving it open carried this pass's failures into the next
                // one, which swallowed the recovery line for every provider
                // that had since started answering.
                failures.settle();
                if (pending?.token === token) {
                    pending = null;
                }
            }
        };
        // Started on a microtask so `pending` is already published when the run
        // body — and its `finally` — first executes.
        pending = { forced, promise: Promise.resolve().then(run), token };
        return pending.promise;
    };
}

function retainProviderSnapshots(
    current: UsageOverview,
    previous: UsageOverview | null
): UsageOverview {
    if (!previous) {
        return current;
    }
    const at = current.capturedAt;
    const claude = retainLastSuccess(current.claude, previous.claude, at);
    const codex = retainLastSuccess(current.codex, previous.codex, at);
    const grok = retainLastSuccess(current.grok, previous.grok, at);
    const openRouter =
        current.openRouter.status === 'error' &&
        current.openRouter.error?.code === 'request' &&
        previous.openRouter.status === 'ok'
            ? previous.openRouter
            : current.openRouter;
    const connectedProviders = new Set(current.connectedProviders);
    if (claude.status === 'ok') {
        connectedProviders.add('claude-code');
    }
    if (codex.status === 'ok') {
        connectedProviders.add('openai-codex');
    }
    if (grok.status === 'ok') {
        connectedProviders.add('grok-build');
    }
    if (openRouter.status === 'ok' && openRouter.overview.status !== 'unconfigured') {
        connectedProviders.add('openrouter');
    }

    return {
        ...current,
        claude,
        codex,
        connectedProviders: [...connectedProviders],
        grok,
        openRouter,
    };
}

/**
 * A retained snapshot always says why it was retained. The cast re-attaches the
 * provider-specific state type to the stamped copy; `stale` is optional on
 * every `status: 'ok'` variant, so the shape stays exact.
 */
function retainLastSuccess<T extends ProviderUsageState>(current: T, previous: T, at: string): T {
    if (current.status !== 'error' || previous.status !== 'ok') {
        return current;
    }
    if (current.error.code !== 'auth' && current.error.code !== 'request') {
        return current;
    }
    const stale: UsageStale = { at, code: current.error.code };
    return { ...previous, stale } as T;
}

async function readUsageCache(path: string): Promise<UsageOverview | null> {
    try {
        const parsed = usageOverviewSchema.safeParse(JSON.parse(await readFile(path, 'utf8')));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

async function writeUsageCache(path: string, usage: UsageOverview): Promise<void> {
    await mkdir(dirname(path), { mode: 0o700, recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(usage)}\n`, { mode: 0o600 });
    await rename(temporary, path);
}
