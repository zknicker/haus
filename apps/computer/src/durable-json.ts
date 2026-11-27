import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function writeDurableJson(destination: string, value: unknown) {
    await mkdir(dirname(destination), { mode: 0o700, recursive: true });
    const temporary = `${destination}.${randomUUID()}.tmp`;
    const file = await open(temporary, 'wx', 0o600);
    try {
        await file.writeFile(JSON.stringify(value));
        await file.sync();
        await file.close();
        await rename(temporary, destination);
    } finally {
        await file.close();
        await rm(temporary, { force: true });
    }
}

export async function readJsonFile(path: string) {
    try {
        return JSON.parse(await readFile(path, 'utf8')) as unknown;
    } catch (cause) {
        if (hasCode(cause, 'ENOENT')) {
            return null;
        }
        throw cause;
    }
}

export function hasCode(cause: unknown, code: string) {
    return cause instanceof Error && 'code' in cause && cause.code === code;
}
