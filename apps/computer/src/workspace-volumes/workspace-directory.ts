import { cp, mkdir, rename } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { z } from 'zod';
import { hostWorkspaceDisk } from './disk-image.ts';
import { inventoryDigest } from './inventory-digest.ts';
import { readJson, releaseWorkspace, writeJson } from './storage-ledger.ts';
import {
    assertEmptyMountpoint,
    exists,
    mountUuid,
    type WorkspaceLocation,
    workspaceVolumePaths,
} from './workspace-volume.ts';

const conversionSchema = z
    .object({
        stage: z.enum(['copying', 'verified', 'detached', 'complete']),
        volumeUuid: z.string().min(1),
        digest: z.string().nullable(),
    })
    .strict();
const volumeMetadata = new Set(['.fseventsd', '.Spotlight-V100', '.Trashes']);

/** Converts only an idle, verified volume; the original image remains as a recovery backup. */
export async function convertWorkspaceVolume(input: WorkspaceLocation, volumeUuid: string) {
    const disk = input.disk === undefined ? hostWorkspaceDisk : input.disk;
    if (!disk) {
        throw new Error('This workspace is a capped macOS volume; open it on macOS.');
    }
    const { image, path } = workspaceVolumePaths(input.agentRoot);
    const receipt = join(input.agentRoot, 'workspace-directory.json');
    const staging = join(input.agentRoot, 'workspace-directory-copy');
    let state = (await readJson(receipt, conversionSchema)) ?? {
        stage: 'copying',
        volumeUuid,
        digest: null,
    };
    if (state.volumeUuid !== volumeUuid) {
        throw new Error('Workspace conversion identity changed.');
    }
    if (state.stage === 'complete') {
        return;
    }
    if (state.stage === 'copying' || state.stage === 'verified') {
        if (!(await exists(image))) {
            throw new Error('Capped workspace image is missing; original preserved.');
        }
        const mounted = (await mountUuid(disk, path)) ?? (await disk.mount(image, path));
        if (mounted !== volumeUuid) {
            throw new Error('Workspace mount belongs to another volume.');
        }
        if ((await disk.holders(path)).length > 0) {
            throw new Error('Workspace is in use; stop its Agent before converting.');
        }
        await writeJson(receipt, state);
        if (state.stage === 'copying') {
            await mkdir(staging, { recursive: true, mode: 0o700 });
            await cp(path, staging, {
                recursive: true,
                preserveTimestamps: true,
                dereference: false,
                verbatimSymlinks: true,
                filter: (source) =>
                    dirname(source) !== path || !volumeMetadata.has(basename(source)),
            });
        }
        const digest = await inventoryDigest(path, volumeMetadata);
        if (digest !== (await inventoryDigest(staging))) {
            throw new Error('Workspace copy verification failed; original preserved.');
        }
        state = { ...state, stage: 'verified', digest };
        await writeJson(receipt, state);
        // A process opened after the first holder check makes detach fail; never force a live workspace.
        await disk.detach(path);
        state = { ...state, stage: 'detached' };
        await writeJson(receipt, state);
    }
    if (state.stage === 'detached') {
        await commitWorkspaceDirectory(input, state);
    }
}

async function commitWorkspaceDirectory(
    input: WorkspaceLocation,
    state: z.infer<typeof conversionSchema>
) {
    const { image, manifest, path } = workspaceVolumePaths(input.agentRoot);
    const receipt = join(input.agentRoot, 'workspace-directory.json');
    const staging = join(input.agentRoot, 'workspace-directory-copy');
    if (await exists(staging)) {
        if (await exists(path)) {
            await assertEmptyMountpoint(path);
            await rename(path, join(input.agentRoot, 'workspace-volume-mount'));
        }
        await rename(staging, path);
    }
    if (state.digest !== (await inventoryDigest(path))) {
        throw new Error('Converted workspace verification failed; backup preserved.');
    }
    await archive(image, join(input.agentRoot, 'workspace.backup.sparsebundle'));
    await archive(manifest, join(input.agentRoot, 'workspace-volume.backup.json'));
    await releaseWorkspace(input.dataRoot, input.agentRoot);
    await writeJson(receipt, { ...state, stage: 'complete' });
}

/** A receipt makes interrupted archive renames safe to replay without overwriting a backup. */
async function archive(source: string, backup: string) {
    if (!(await exists(source))) {
        return;
    }
    if (await exists(backup)) {
        throw new Error('Workspace backup already exists; refusing to overwrite it.');
    }
    await rename(source, backup);
}

export async function workspaceConversion(input: WorkspaceLocation) {
    return await readJson(join(input.agentRoot, 'workspace-directory.json'), conversionSchema);
}
