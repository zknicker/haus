import { join } from 'node:path';
import type { DriveFolderLayout } from '../../drive/folder-state.ts';

const pathSafeId = /^[A-Za-z0-9_-]{1,128}$/u;

export function workersRoot(dataRoot: string, serverId: string) {
    return join(dataRoot, 'servers', serverId, 'workers');
}

export function workerLayout(dataRoot: string, serverId: string, workerId: string) {
    if (!pathSafeId.test(workerId)) {
        throw new Error(`"${workerId}" cannot name a Worker folder.`);
    }
    const root = join(workersRoot(dataRoot, serverId), workerId);
    const runtime = join(root, 'runtime');
    return {
        bin: join(runtime, 'bin'),
        checkout: join(root, 'checkout'),
        drive: join(root, 'drive'),
        root,
        turnsFile: join(runtime, 'turns.json'),
        workerId,
        driveFolder: (writer: string) =>
            ({
                folder: join(root, 'drive'),
                refused: join(root, 'drive-refused'),
                scratch: join(runtime, 'drive-scratch'),
                stateFile: join(runtime, 'drive.json'),
                writer,
            }) satisfies DriveFolderLayout,
    };
}
export type WorkerLayout = ReturnType<typeof workerLayout>;

export function repoClonePath(dataRoot: string, repository: string) {
    const [owner, name] = repository.toLowerCase().split('/');
    if (!(owner && name) || owner.startsWith('.') || name.startsWith('.')) {
        throw new Error(`"${repository}" cannot name a repository folder.`);
    }
    return join(dataRoot, 'repos', owner, name);
}
