import { link, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as z from 'zod';

export interface NoticeReceipt {
    readonly runId: string;
    readonly workIds: readonly string[];
}

const storedSchema = z.object({
    notice: z.string().min(1),
    receipt: z.object({ runId: z.string(), workIds: z.array(z.string()) }).optional(),
});

export type StoredNotice = z.infer<typeof storedSchema>;

export async function readPendingNotice(runtimeDir: string) {
    try {
        const parsed = storedSchema.safeParse(
            JSON.parse(await readFile(noticePath(runtimeDir), 'utf8'))
        );
        return parsed.success ? parsed.data : null;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

export async function writePendingNotice(
    runtimeDir: string,
    stored: { readonly notice: string; readonly receipt?: NoticeReceipt }
) {
    await mkdir(runtimeDir, { mode: 0o700, recursive: true });
    const temporary = `${noticePath(runtimeDir)}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(stored)}\n`, { mode: 0o600 });
    await rename(temporary, noticePath(runtimeDir));
}

export async function clearPendingNotice(runtimeDir: string, matching?: string) {
    if (matching !== undefined && (await readPendingNotice(runtimeDir))?.notice !== matching) {
        return;
    }
    await rm(noticePath(runtimeDir), { force: true });
}

export async function restorePendingNotice(runtimeDir: string, notice: string) {
    await mkdir(runtimeDir, { mode: 0o700, recursive: true });
    const temporary = `${noticePath(runtimeDir)}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ notice })}\n`, { mode: 0o600 });
    try {
        await link(temporary, noticePath(runtimeDir));
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
            return false;
        }
        throw error;
    } finally {
        await rm(temporary, { force: true });
    }
}

function noticePath(runtimeDir: string) {
    return join(runtimeDir, 'pending-notice.json');
}
