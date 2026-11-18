import type { Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { RuntimeTokenUsageSnapshot } from '@haus/api';

export interface RuntimeTokenEntry {
    cacheReadTokens: number;
    cacheWriteTokens: number;
    id: string;
    inputTokens: number;
    modelId: string;
    outputTokens: number;
    timestampMs: number;
    totalTokens: number;
}

export interface RecentUsageFile {
    mtimeMs: number;
    path: string;
    size: number;
}

const jsonLineCache = new Map<string, { mtimeMs: number; rows: unknown[]; size: number }>();

export async function collectRecentJsonlFiles(
    root: string,
    fileName: ((name: string) => boolean) | string,
    cutoffMs: number
): Promise<RecentUsageFile[]> {
    if (!(await isDirectory(root))) {
        return [];
    }
    const files: RecentUsageFile[] = [];
    const pending = [root];
    while (pending.length > 0) {
        const directory = pending.pop();
        if (!directory) {
            break;
        }
        let entries: Dirent[];
        try {
            entries = await readdir(directory, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) {
                pending.push(path);
                continue;
            }
            const matches =
                typeof fileName === 'string' ? entry.name === fileName : fileName(entry.name);
            if (!(entry.isFile() && matches)) {
                continue;
            }
            try {
                const metadata = await stat(path);
                if (metadata.mtimeMs >= cutoffMs) {
                    files.push({
                        mtimeMs: metadata.mtimeMs,
                        path,
                        size: metadata.size,
                    });
                } else {
                    jsonLineCache.delete(path);
                }
            } catch {
                // A session can disappear while the Computer scans it.
            }
        }
    }
    return files.sort((left, right) => left.path.localeCompare(right.path));
}

export async function readJsonLines(file: RecentUsageFile): Promise<unknown[]> {
    const cached = jsonLineCache.get(file.path);
    if (cached && cached.mtimeMs === file.mtimeMs && cached.size === file.size) {
        return cached.rows;
    }
    let content: string;
    try {
        content = await readFile(file.path, 'utf8');
    } catch {
        return [];
    }
    const rows: unknown[] = [];
    for (const line of content.split(/\r?\n/)) {
        if (!line.trim()) {
            continue;
        }
        try {
            rows.push(JSON.parse(line));
        } catch {
            // Local runtime logs are append-only; ignore partial/corrupt rows.
        }
    }
    jsonLineCache.set(file.path, {
        mtimeMs: file.mtimeMs,
        rows,
        size: file.size,
    });
    return rows;
}

export function usageFilesFingerprint(files: RecentUsageFile[], now: Date): string {
    return JSON.stringify([
        usageCutoffMs(now),
        files.map((file) => [file.path, file.mtimeMs, file.size]),
    ]);
}

export function buildRuntimeTokenSnapshot(
    entries: RuntimeTokenEntry[],
    runtimeId: RuntimeTokenUsageSnapshot['runtimeId'],
    source: RuntimeTokenUsageSnapshot['source'],
    now: Date
): RuntimeTokenUsageSnapshot {
    const cutoffMs = usageCutoffMs(now);
    const tomorrowMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    const models = new Map<string, RuntimeTokenUsageSnapshot['totals']>();
    const totals = emptyTotals();
    for (const entry of entries) {
        if (entry.timestampMs < cutoffMs || entry.timestampMs >= tomorrowMs) {
            continue;
        }
        addTotals(totals, entry);
        const model = models.get(entry.modelId) ?? emptyTotals();
        addTotals(model, entry);
        models.set(entry.modelId, model);
    }
    return {
        capturedAt: now.toISOString(),
        days: 30,
        models: [...models.entries()]
            .map(([modelId, modelTotals]) => ({ modelId, ...modelTotals }))
            .sort((a, b) => b.totalTokens - a.totalTokens || a.modelId.localeCompare(b.modelId)),
        runtimeId,
        source,
        totals,
    };
}

export function usageCutoffMs(now: Date): number {
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29);
}

export function objectValue(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

export function tokenCount(value: unknown): number {
    const number = typeof value === 'string' ? Number(value) : value;
    return typeof number === 'number' && Number.isFinite(number) && number > 0
        ? Math.floor(number)
        : 0;
}

function emptyTotals(): RuntimeTokenUsageSnapshot['totals'] {
    return {
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
    };
}

function addTotals(
    target: RuntimeTokenUsageSnapshot['totals'],
    source: RuntimeTokenUsageSnapshot['totals']
) {
    target.cacheReadTokens += source.cacheReadTokens;
    target.cacheWriteTokens += source.cacheWriteTokens;
    target.inputTokens += source.inputTokens;
    target.outputTokens += source.outputTokens;
    target.totalTokens += source.totalTokens;
}

async function isDirectory(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}
