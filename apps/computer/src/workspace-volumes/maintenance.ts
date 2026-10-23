import { macWorkspaceDisk } from './disk-image.ts';
import { readJson, withStorageLock } from './storage-ledger.ts';
import {
    assertEmptyMountpoint,
    ensureAgentWorkspace,
    exists,
    mountUuid,
    type WorkspaceLocation,
    workspaceVolumePaths,
    workspaceVolumeSchema,
} from './workspace-volume.ts';

export interface WorkspaceMaintenance extends WorkspaceLocation {
    assertComputerStopped(): Promise<void>;
}

/** The migration now removes the old cap, preserving the original image as a backup. */
export async function migrateAgentWorkspace(input: WorkspaceMaintenance) {
    await input.assertComputerStopped();
    const workspace = await ensureAgentWorkspace(input);
    const backup = `${input.agentRoot}/workspace.backup.sparsebundle`;
    return { path: workspace.path, ...((await exists(backup)) ? { backup } : {}) };
}

/** Kept for an older, not-yet-converted volume; ordinary directories need no compaction. */
export function compactAgentWorkspace(input: WorkspaceMaintenance) {
    return withStorageLock(input.dataRoot, async () => {
        await input.assertComputerStopped();
        const disk = input.disk ?? macWorkspaceDisk;
        const { image, manifest, path } = workspaceVolumePaths(input.agentRoot);
        const record = await readJson(manifest, workspaceVolumeSchema);
        if (!(record && (await exists(image)))) {
            throw new Error('Only capped workspaces can be compacted.');
        }
        const mounted = await mountUuid(disk, path);
        if (mounted && mounted !== record.volumeUuid) {
            throw new Error('Workspace mount belongs to another volume.');
        }
        if (mounted) {
            await disk.detach(path);
        }
        let failure: unknown;
        try {
            await disk.compact(image);
        } catch (error) {
            failure = error;
        }
        if (mounted) {
            await assertEmptyMountpoint(path);
            if ((await disk.mount(image, path)) !== record.volumeUuid) {
                throw new Error('Workspace image identity changed after compaction.');
            }
        }
        if (failure) {
            throw failure;
        }
    });
}
