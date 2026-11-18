import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ClaudeUsageSnapshot } from '@haus/claude-usage';
import { z } from 'zod';

const DEFAULT_SDK_REFRESH_INTERVAL_MS = 15 * 60_000;

const windowSchema = z.object({
    id: z.enum([
        'current-session',
        'current-week-all-models',
        'current-week-opus',
        'current-week-sonnet',
    ]),
    label: z.string(),
    remainingPercent: z.number(),
    resetsAt: z.string().nullable(),
    usedPercent: z.number(),
});

const snapshotSchema = z.object({
    capturedAt: z.string(),
    extraUsage: z
        .object({ monthlyLimitUsd: z.number().nullable(), usedUsd: z.number() })
        .nullable(),
    provider: z.literal('claude'),
    source: z.enum(['anthropic-oauth-usage', 'claude-code-sdk-usage']),
    subscriptionType: z.string().nullable(),
    windows: z.array(windowSchema),
});

const stateSchema = z.object({
    fallbackFailures: z.number().int().nonnegative(),
    nextFallbackAt: z.number().nonnegative(),
    nextSdkRefreshAt: z.number().nonnegative(),
    snapshot: snapshotSchema.nullable(),
});

export type ClaudePlanUsageState = z.infer<typeof stateSchema>;

const updates = new Map<string, Promise<void>>();

export async function readClaudePlanUsageState(dataRoot: string): Promise<ClaudePlanUsageState> {
    try {
        const parsed = stateSchema.safeParse(
            JSON.parse(await readFile(claudePlanUsageStatePath(dataRoot), 'utf8'))
        );
        return parsed.success ? parsed.data : emptyState();
    } catch {
        return emptyState();
    }
}

export async function claimClaudeSdkUsageRefresh(
    dataRoot: string,
    now = new Date(),
    refreshIntervalMs = DEFAULT_SDK_REFRESH_INTERVAL_MS
): Promise<boolean> {
    let claimed = false;
    await updateState(dataRoot, (state) => {
        if (now.getTime() < state.nextSdkRefreshAt) {
            return state;
        }
        claimed = true;
        return { ...state, nextSdkRefreshAt: now.getTime() + refreshIntervalMs };
    });
    return claimed;
}

export async function saveClaudePlanUsageSnapshot(
    dataRoot: string,
    snapshot: ClaudeUsageSnapshot,
    refreshIntervalMs = DEFAULT_SDK_REFRESH_INTERVAL_MS
): Promise<void> {
    await updateState(dataRoot, (state) => ({
        ...state,
        fallbackFailures: 0,
        nextFallbackAt: 0,
        nextSdkRefreshAt: Date.parse(snapshot.capturedAt) + refreshIntervalMs,
        snapshot,
    }));
}

export async function scheduleClaudeUsageFallback(
    dataRoot: string,
    nextFallbackAt: number,
    failed: boolean
): Promise<void> {
    await updateState(dataRoot, (state) => ({
        ...state,
        fallbackFailures: failed ? state.fallbackFailures + 1 : state.fallbackFailures,
        nextFallbackAt,
    }));
}

export function claudePlanUsageStatePath(dataRoot: string): string {
    return join(dataRoot, 'providers', 'claude-plan-usage.json');
}

async function updateState(
    dataRoot: string,
    update: (state: ClaudePlanUsageState) => ClaudePlanUsageState
): Promise<void> {
    const path = claudePlanUsageStatePath(dataRoot);
    const previous = updates.get(path) ?? Promise.resolve();
    const current = previous
        .catch(() => undefined)
        .then(async () => {
            const next = update(await readClaudePlanUsageState(dataRoot));
            await mkdir(dirname(path), { mode: 0o700, recursive: true });
            const temporary = `${path}.${process.pid}.tmp`;
            await writeFile(temporary, `${JSON.stringify(next)}\n`, { mode: 0o600 });
            await rename(temporary, path);
        });
    updates.set(path, current);
    try {
        await current;
    } finally {
        if (updates.get(path) === current) {
            updates.delete(path);
        }
    }
}

function emptyState(): ClaudePlanUsageState {
    return {
        fallbackFailures: 0,
        nextFallbackAt: 0,
        nextSdkRefreshAt: 0,
        snapshot: null,
    };
}
