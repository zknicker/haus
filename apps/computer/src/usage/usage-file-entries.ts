import type { RecentUsageFile } from './local-runtime-usage.ts';

interface CachedEntries<Entry> {
    entries: Entry[];
    mtimeMs: number;
    size: number;
}

export function createUsageEntryReader<Entry>(parse: (rows: unknown[]) => Entry[]) {
    const cache = new Map<string, CachedEntries<Entry>>();
    return async (files: readonly RecentUsageFile[]) => {
        const current = new Set(files.map((file) => file.path));
        for (const path of cache.keys()) {
            if (!current.has(path)) {
                cache.delete(path);
            }
        }
        const entries: Entry[] = [];
        for (const file of files) {
            for (const entry of await fileEntries(file, cache, parse)) {
                entries.push(entry);
            }
        }
        return entries;
    };
}

async function fileEntries<Entry>(
    file: RecentUsageFile,
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
                entries.push(entry);
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
    for await (const chunk of Bun.file(path).stream().pipeThrough(new TextDecoderStream())) {
        if (!chunk.includes('\n')) {
            pending += chunk;
            continue;
        }
        const lines = `${pending}${chunk}`.split('\n');
        pending = lines.pop() ?? '';
        yield* lines;
    }
    yield pending;
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
