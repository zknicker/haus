import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { type DriveAreaCounters, artifactPathKey } from '@haus/api';
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

export const unplacedMtimeMs = -1;

const fileRecordSchema = z.object({
    artifact_id: z.string().min(1),
    mtime_ms: z.number(),
    path: z.string().min(1),
    revision_id: z.string().min(1),
    seen_head: z.string().min(1).optional(),
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
    leftBehind: z.array(z.string().min(1)).default([]),
    openPush: z.string().min(1).nullable(),
    pendingCreates: z.record(
        z.string(),
        z.object({
            request_id: z.string().min(1),
            seen_head: z.string().min(1).optional(),
            sha256: z.string().min(1),
        })
    ),
    placing: z
        .record(z.string(), fileRecordSchema.omit({ mtime_ms: true, seen_head: true }))
        .default({}),
    retired: z.record(z.string(), z.string()),
    version: z.literal(1),
});
export type DriveFolderState = z.infer<typeof folderStateSchema>;
export type DrivePlacement = DriveFolderState['placing'][string];

const emptyState: DriveFolderState = {
    areas: [],
    counters: {},
    files: {},
    leftBehind: [],
    openPush: null,
    pendingCreates: {},
    placing: {},
    retired: {},
    version: 1,
};

export async function openFolderState(layout: DriveFolderLayout) {
    let state = emptyState;
    const persist = async (next: DriveFolderState) => {
        await writeJsonAtomic(layout.stateFile, next);
        state = next;
    };
    const loaded = await loadFolderState(layout);
    if (loaded === 'orphaned') {
        await persist(emptyState);
    } else {
        state = loaded;
    }
    return {
        current: () => state,
        record: (record: DriveFileRecord) => {
            const { [record.path]: _revived, ...retired } = state.retired;
            const { [record.path]: _resolved, ...pendingCreates } = state.pendingCreates;
            const { [record.path]: _placed, ...placing } = state.placing;
            const files = { ...state.files, [record.path]: record };
            return persist({ ...state, files, pendingCreates, placing, retired });
        },
        notePlacing: (placement: DrivePlacement) =>
            persist({ ...state, placing: { ...state.placing, [placement.path]: placement } }),
        dropPlacing: (path: string) => {
            const { [path]: _dropped, ...placing } = state.placing;
            return path in state.placing ? persist({ ...state, placing }) : Promise.resolve();
        },
        forget: (path: string) => {
            const forgotten = state.files[path];
            const { [path]: _resolved, ...pendingCreates } = state.pendingCreates;
            if (!forgotten) {
                return path in state.pendingCreates
                    ? persist({ ...state, pendingCreates })
                    : Promise.resolve();
            }
            const { [path]: _forgotten, ...files } = state.files;
            const retired = { ...state.retired, [path]: forgotten.revision_id };
            return persist({ ...state, files, pendingCreates, retired });
        },
        dropPendingCreate: (path: string) => {
            const { [path]: _dropped, ...pendingCreates } = state.pendingCreates;
            return path in state.pendingCreates
                ? persist({ ...state, pendingCreates })
                : Promise.resolve();
        },
        rename: (moves: readonly { from: string; to: string }[]) => {
            let { files, pendingCreates } = state;
            for (const move of moves) {
                files = renamedKeys(files, move, (record, path) => ({ ...record, path }));
                pendingCreates = renamedKeys(pendingCreates, move, (create) => create);
            }
            return persist({ ...state, files, pendingCreates });
        },
        notePendingCreate: (path: string, create: { request_id: string; sha256: string }) =>
            persist({
                ...state,
                pendingCreates: {
                    ...state.pendingCreates,
                    [path]: { ...create, seen_head: state.pendingCreates[path]?.seen_head },
                },
            }),
        adopt: (records: readonly DriveFileRecord[]) =>
            persist({
                ...state,
                files: {
                    ...state.files,
                    ...Object.fromEntries(records.map((record) => [record.path, record])),
                },
            }),
        markSeen: (path: string, head: string) => {
            const record = state.files[path];
            const pending = state.pendingCreates[path];
            if (record) {
                return record.seen_head === head
                    ? Promise.resolve()
                    : persist({
                          ...state,
                          files: { ...state.files, [path]: { ...record, seen_head: head } },
                      });
            }
            return pending && pending.seen_head !== head
                ? persist({
                      ...state,
                      pendingCreates: {
                          ...state.pendingCreates,
                          [path]: { ...pending, seen_head: head },
                      },
                  })
                : Promise.resolve();
        },
        advance: (areas: DriveFolderArea[], counters: DriveAreaCounters) =>
            persist({ ...state, areas, counters }),
        openPush: (pushId: string | null) => persist({ ...state, openPush: pushId }),
        noteLeftBehind: (paths: readonly string[]) =>
            persist({ ...state, leftBehind: [...new Set([...state.leftBehind, ...paths])].sort() }),
    };
}
export type FolderStateStore = Awaited<ReturnType<typeof openFolderState>>;

export function areaOfPath(areas: readonly DriveFolderArea[], path: string) {
    return areas.find((area) => path.startsWith(`${area.root}/`)) ?? null;
}

export function isReadOnlyArea(area: string | null, writer: string) {
    return area !== null && area.startsWith('agent:') && area !== `agent:${writer}`;
}

export function foldedRecord(state: DriveFolderState, path: string) {
    const key = artifactPathKey(path);
    return (
        Object.values(state.files).find(
            (record) => record.path !== path && artifactPathKey(record.path) === key
        ) ?? null
    );
}

export async function readFolderState(layout: DriveFolderLayout) {
    const loaded = await loadFolderState(layout);
    return loaded === 'orphaned' ? null : loaded;
}

async function loadFolderState(layout: DriveFolderLayout) {
    const raw = await readFile(layout.stateFile, 'utf8').catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        throw error;
    });
    if (raw === null) {
        return emptyState;
    }
    const folder = await lstat(layout.folder).catch(() => null);
    return folder?.isDirectory() ? folderStateSchema.parse(JSON.parse(raw)) : ('orphaned' as const);
}

function renamedKeys<Entry>(
    entries: Record<string, Entry>,
    move: { from: string; to: string },
    respelled: (entry: Entry, path: string) => Entry
) {
    const moved = (path: string) => {
        if (path === move.from) {
            return move.to;
        }
        return path.startsWith(`${move.from}/`)
            ? `${move.to}${path.slice(move.from.length)}`
            : path;
    };
    return Object.fromEntries(
        Object.entries(entries).map(([path, entry]) => {
            const to = moved(path);
            return [to, to === path ? entry : respelled(entry, to)];
        })
    );
}

async function writeJsonAtomic(path: string, value: unknown) {
    await mkdir(dirname(path), { mode: 0o700, recursive: true });
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(value), { mode: 0o600 });
    await rename(temp, path);
}
