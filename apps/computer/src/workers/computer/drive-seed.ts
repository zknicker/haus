import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, readdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { folderFiles, sha256File } from '../../drive/folder-files.ts';
import {
    areaOfPath,
    type DriveFileRecord,
    type DriveFolderLayout,
    type DriveFolderState,
    isReadOnlyArea,
    openFolderState,
    readFolderState,
} from '../../drive/folder-state.ts';
import { serialized } from '../serialized.ts';
import { type WorkerLayout, workerLayoutIn } from './layout.ts';
import { removeTree } from './remove-tree.ts';

export async function seedWorkerDrive(layout: WorkerLayout, writer: string) {
    const target = layout.driveFolder(writer);
    if (existsSync(target.stateFile) || existsSync(target.folder)) {
        return 0;
    }
    const source = await freshestSibling(layout, writer);
    if (!source) {
        return 0;
    }
    const staging = join(dirname(target.folder), `.drive-seed-${randomUUID()}`);
    try {
        const records = await serialized(`drive:${source.layout.folder}`, () =>
            copyClean({ source, staging, target })
        );
        await (await openFolderState(target)).adopt(records);
        await rename(staging, target.folder);
        return records.length;
    } finally {
        await removeTree(staging);
    }
}

async function copyClean(input: {
    source: { layout: DriveFolderLayout; state: DriveFolderState };
    staging: string;
    target: DriveFolderLayout;
}) {
    const { source, staging, target } = input;
    const files = folderFiles({ ...target, folder: staging });
    const records: DriveFileRecord[] = [];
    for (const record of Object.values(source.state.files)) {
        const scratch = await files.scratchFile();
        const copied = await copyFile(
            join(source.layout.folder, ...record.path.split('/')),
            scratch
        )
            .then(() => true)
            .catch(() => false);
        if (!(copied && (await sha256File(scratch)) === record.sha256)) {
            await rm(scratch, { force: true });
            continue;
        }
        const area = areaOfPath(source.state.areas, record.path);
        const readOnlyRoot = isReadOnlyArea(area?.area ?? null, target.writer)
            ? (area?.root ?? null)
            : null;
        const mtimeMs = await files.place(record.path, scratch, readOnlyRoot);
        const { seen_head: _seen, ...clean } = record;
        records.push({ ...clean, mtime_ms: mtimeMs });
    }
    await files.relock();
    await files.clearScratch();
    return records;
}

async function freshestSibling(layout: WorkerLayout, writer: string) {
    const workersFolder = dirname(layout.root);
    const names = await readdir(workersFolder).catch(() => []);
    let freshest: { layout: DriveFolderLayout; state: DriveFolderState; total: number } | null =
        null;
    for (const name of names.filter((entry) => entry !== layout.workerId)) {
        const sibling = siblingDrive(workersFolder, name, writer);
        const state = sibling ? await readFolderState(sibling).catch(() => null) : null;
        const total = state ? Object.values(state.counters).reduce((sum, n) => sum + n, 0) : 0;
        if (sibling && state && total > (freshest?.total ?? 0)) {
            freshest = { layout: sibling, state, total };
        }
    }
    return freshest;
}

function siblingDrive(workersFolder: string, name: string, writer: string) {
    try {
        return workerLayoutIn(workersFolder, name).driveFolder(writer);
    } catch {
        return null;
    }
}
