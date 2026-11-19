import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { DriveAreaCounters } from '@haus/api';
import * as z from 'zod';

export interface DriveFolderLayout {
    folder: string;
    refused: string;
    scratch: string;
    stateFile: string;
    writer: string;
}

export function driveFolderLayout(agentRoot: string, agentId: string) {
    return {
        folder: join(agentRoot, 'workspace', 'drive'),
        refused: join(agentRoot, 'workspace', 'drive-refused'),
        scratch: join(agentRoot, 'runtime', 'drive-scratch'),
        stateFile: join(agentRoot, 'runtime', 'drive.json'),
        writer: agentId,
    } satisfies DriveFolderLayout;
}

const fileRecordSchema = z.object({
    artifact_id: z.string().min(1),
    mtime_ms: z.number(),
    path: z.string().min(1),
    revision_id: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    size_bytes: z.number().int().nonnegative(),
});
export type DriveFileRecord = z.infer<typeof fileRecordSchema>;

const areaSchema = z.object({ area: z.string().min(1), root: z.string().min(1) });
export type DriveFolderArea = z.infer<typeof areaSchema>;

const folderStateSchema = z.object({
    areas: z.array(areaSchema),
    counters: z.record(z.string(), z.number().int().nonnegative()),
    files: z.record(z.string(), fileRecordSchema),
    openPush: z.string().min(1).nullable(),
    version: z.literal(1),
});
export type DriveFolderState = z.infer<typeof folderStateSchema>;

const emptyState: DriveFolderState = {
    areas: [],
    counters: {},
    files: {},
    openPush: null,
    version: 1,
};

export async function openFolderState(layout: DriveFolderLayout) {
    let state = await loadFolderState(layout);
    const persist = async (next: DriveFolderState) => {
        await writeJsonAtomic(layout.stateFile, next);
        state = next;
    };
    return {
        current: () => state,
        record: (record: DriveFileRecord) =>
            persist({ ...state, files: { ...state.files, [record.path]: record } }),
        forget: (path: string) => {
            if (!(path in state.files)) {
                return Promise.resolve();
            }
            const { [path]: _forgotten, ...files } = state.files;
            return persist({ ...state, files });
        },
        advance: (areas: DriveFolderArea[], counters: DriveAreaCounters) =>
            persist({ ...state, areas, counters }),
        openPush: (pushId: string | null) => persist({ ...state, openPush: pushId }),
    };
}
export type FolderStateStore = Awaited<ReturnType<typeof openFolderState>>;

export function areaOfPath(areas: readonly DriveFolderArea[], path: string) {
    return areas.find((area) => path.startsWith(`${area.root}/`)) ?? null;
}

export function isReadOnlyArea(area: string | null, writer: string) {
    return area !== null && area.startsWith('agent:') && area !== `agent:${writer}`;
}

async function loadFolderState(layout: DriveFolderLayout) {
    const folder = await lstat(layout.folder).catch(() => null);
    if (!folder?.isDirectory()) {
        return emptyState;
    }
    const raw = await readFile(layout.stateFile, 'utf8').catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        throw error;
    });
    return raw === null ? emptyState : folderStateSchema.parse(JSON.parse(raw));
}

async function writeJsonAtomic(path: string, value: unknown) {
    await mkdir(dirname(path), { mode: 0o700, recursive: true });
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(value), { mode: 0o600 });
    await rename(temp, path);
}
