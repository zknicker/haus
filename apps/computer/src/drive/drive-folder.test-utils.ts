import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { driveRemote } from './drive-remote.ts';
import type { DriveServer } from './drive-server.fixture.ts';
import { driveFolderLayout, type DriveFolderState } from './folder-state.ts';
import { pullDrive } from './pull.ts';
import { planDrivePush, sendDrivePush } from './push.ts';

export const caseInsensitiveDisk = (() => {
    const probe = mkdtempSync(join(tmpdir(), 'haus-drive-case-'));
    writeFileSync(join(probe, 'Probe'), '');
    const folds = existsSync(join(probe, 'probe'));
    rmSync(probe, { force: true, recursive: true });
    return folds;
})();

export function writerFolder(server: DriveServer, agentId: string) {
    const root = mkdtempSync(join(tmpdir(), `haus-drive-${agentId}-`));
    const layout = driveFolderLayout(root, agentId);
    const remote = driveRemote({ serverOrigin: server.origin, token: agentId });
    const local = (path: string) => join(layout.folder, ...path.split('/'));
    return {
        layout,
        pull: () => pullDrive({ layout, remote }),
        async push(runId: string) {
            const plan = await planDrivePush(layout);
            return plan.isEmpty ? null : await sendDrivePush(plan, remote, runId);
        },
        read: (path: string) => readFile(local(path), 'utf8').catch(() => null),
        readRefused: (path: string) =>
            readFile(join(layout.refused, ...path.split('/')), 'utf8').catch(() => null),
        async write(path: string, text: string) {
            await mkdir(dirname(local(path)), { recursive: true });
            await writeFile(local(path), text);
        },
        remove: (path: string) => rm(local(path)),
        rename: (from: string, to: string) => rename(local(from), local(to)),
        names: (path: string) => readdir(local(path)),
        mode: async (path: string) => (await lstat(local(path))).mode & 0o777,
        state: async () => JSON.parse(await readFile(layout.stateFile, 'utf8')) as DriveFolderState,
        async cleanup() {
            Bun.spawnSync(['chmod', '-R', 'u+w', root]);
            await rm(root, { force: true, recursive: true });
        },
    };
}
