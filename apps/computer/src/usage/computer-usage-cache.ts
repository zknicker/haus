import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { type UsageOverview, usageOverviewSchema } from '@haus/api';
import { readComputerUsage } from './read-usage.ts';

const DEFAULT_REFRESH_INTERVAL_MS = 15 * 60_000;

export function createComputerUsageCache(options: {
    dataRoot: string;
    load?: typeof readComputerUsage;
    refreshIntervalMs?: number;
}) {
    const cachePath = join(options.dataRoot, 'usage-cache.json');
    const load = options.load ?? readComputerUsage;
    const refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;
    let cached: UsageOverview | null = null;
    let cacheLoad: Promise<UsageOverview | null> | null = null;
    let refresh: Promise<UsageOverview> | null = null;

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
        if (refresh) {
            return refresh;
        }

        refresh = (async () => {
            try {
                const current = await load({
                    ...readOptions,
                    dataRoot: options.dataRoot,
                    now: () => now,
                });
                cached = mergeTransientProviderFailures(current, cached);
                await writeUsageCache(cachePath, cached);
                return cached;
            } catch (error) {
                if (cached) {
                    return cached;
                }
                throw error;
            } finally {
                refresh = null;
            }
        })();
        return refresh;
    };
}

function mergeTransientProviderFailures(
    current: UsageOverview,
    previous: UsageOverview | null
): UsageOverview {
    if (!previous) {
        return current;
    }
    const claude = retainLastSuccess(current.claude, previous.claude);
    const codex = retainLastSuccess(current.codex, previous.codex);
    const grok = retainLastSuccess(current.grok, previous.grok);
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

function retainLastSuccess<T extends UsageOverview['claude' | 'codex' | 'grok']>(
    current: T,
    previous: T
): T {
    return current.status === 'error' &&
        (current.error.code === 'request' || current.error.code === 'auth') &&
        previous.status === 'ok'
        ? previous
        : current;
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
