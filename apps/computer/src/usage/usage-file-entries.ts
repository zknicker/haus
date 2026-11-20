import type { RecentUsageFile } from './local-runtime-usage.ts';

export const usageLineLimitChars = 16 * 1024 * 1024;

interface CachedEntries<Entry> {
    entries: Entry[];
    mtimeMs: number;
    size: number;
}

export function createUsageEntryReader<Entry extends { timestampMs: number }>(
    parse: (rows: unknown[]) => Entry[]
) {
    const cache = new Map<string, CachedEntries<Entry>>();
    return async (files: readonly RecentUsageFile[], cutoffMs: number) => {
        const current = new Set(files.map((file) => file.path));
        for (const [path, cached] of cache) {
            if (current.has(path)) {
                cached.entries = cached.entries.filter((entry) => entry.timestampMs >= cutoffMs);
            } else {
                cache.delete(path);
            }
        }
        const entries: Entry[] = [];
        for (const file of files) {
            for (const entry of await fileEntries(file, cutoffMs, cache, parse)) {
                entries.push(entry);
            }
        }
        return entries;
    };
}

async function fileEntries<Entry extends { timestampMs: number }>(
    file: RecentUsageFile,
    cutoffMs: number,
    cache: Map<string, CachedEntries<Entry>>,
    parse: (rows: unknown[]) => Entry[]
) {
    const cached = cache.get(file.path);
    if (cached && cached.mtimeMs === file.mtimeMs && cached.size === file.size) {
        return cached.entries;
    }
    const entries: Entry[] = [];
    try {
        for await (const line of fileLines(file.path)) {
            for (const entry of parse(usageRows(line))) {
                if (entry.timestampMs >= cutoffMs) {
                    entries.push(entry);
                }
            }
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return [];
        }
        throw error;
    }
    Bun.gc(true);
    cache.set(file.path, { entries, mtimeMs: file.mtimeMs, size: file.size });
    return entries;
}

async function* fileLines(path: string) {
    let pending = '';
    let oversized = false;
    for await (const chunk of Bun.file(path).stream().pipeThrough(new TextDecoderStream())) {
        const lines = chunk.split('\n');
        const rest = lines.pop() ?? '';
        for (const line of lines) {
            if (!oversized && pending.length + line.length <= usageLineLimitChars) {
                yield `${pending}${line}`;
            }
            pending = '';
            oversized = false;
        }
        if (!oversized) {
            pending += rest;
            if (pending.length > usageLineLimitChars) {
                pending = '';
                oversized = true;
            }
        }
    }
    if (!oversized) {
        yield pending;
    }
}

function usageRows(line: string) {
    if (!line.includes('"usage"')) {
        return [];
    }
    try {
        return [JSON.parse(line) as unknown];
    } catch {
        return [];
    }
}
