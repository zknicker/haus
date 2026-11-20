import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import * as z from 'zod';
import { readJson, writeJsonAtomic } from './inbox-store.ts';

const idsSchema = z.array(z.string());

export function unknownToolCalls(runtimeDir: string) {
    const path = join(runtimeDir, 'unknown-tool-calls.json');
    const read = async () => {
        const raw = await readJson(path);
        return raw === null ? [] : idsSchema.parse(raw);
    };
    return {
        async add(toolCallIds: readonly string[]) {
            await writeJsonAtomic(path, [...new Set([...(await read()), ...toolCallIds])]);
        },
        async clear() {
            await rm(path, { force: true });
        },
        read,
    };
}
