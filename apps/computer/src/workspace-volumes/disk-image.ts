import { execFile } from 'node:child_process';
import { mkdir, realpath } from 'node:fs/promises';
import { promisify } from 'node:util';
import { z } from 'zod';

const execute = promisify(execFile);
const volumeInfoSchema = z.object({
    MountPoint: z.string().optional(),
    VolumeUUID: z.string().optional(),
});

export interface WorkspaceDisk {
    compact(image: string): Promise<void>;
    create(image: string, capacityBytes: number): Promise<void>;
    detach(mountpoint: string): Promise<void>;
    mount(image: string, mountpoint: string): Promise<string>;
    mountedUuid(mountpoint: string): Promise<string | null>;
}

/** DiskImages still exposes sparsebundle compaction through hdiutil. */
export const macWorkspaceDisk: WorkspaceDisk = {
    async create(image, capacityBytes) {
        assertMac();
        await run('hdiutil', [
            'create',
            '-sectors',
            String(Math.ceil(capacityBytes / 512)),
            '-fs',
            'Case-sensitive APFS',
            '-type',
            'SPARSEBUNDLE',
            '-volname',
            'Haus Workspace',
            image,
        ]);
    },
    async mount(image, mountpoint) {
        assertMac();
        await mkdir(mountpoint, { recursive: true, mode: 0o500 });
        const target = await realpath(mountpoint);
        await run('hdiutil', ['attach', '-nobrowse', '-mountpoint', target, image]);
        const uuid = await this.mountedUuid(mountpoint);
        if (!uuid) {
            throw new Error('Workspace image did not mount at the requested path.');
        }
        return uuid;
    },
    async mountedUuid(mountpoint) {
        assertMac();
        const canonical = await realpath(mountpoint);
        const mounts = await run('/sbin/mount', []);
        if (!mounts.split('\n').some((line) => line.includes(` on ${canonical} (`))) {
            return null;
        }
        const plist = await run('diskutil', ['info', '-plist', mountpoint]);
        const process = Bun.spawn(['plutil', '-convert', 'json', '-o', '-', '--', '-'], {
            stdin: new TextEncoder().encode(plist),
            stdout: 'pipe',
            stderr: 'pipe',
        });
        const [json, error, code] = await Promise.all([
            new Response(process.stdout).text(),
            new Response(process.stderr).text(),
            process.exited,
        ]);
        if (code !== 0) {
            throw new Error(`Cannot inspect workspace mount: ${error}`);
        }
        const info = volumeInfoSchema.parse(JSON.parse(json));
        return info.MountPoint === canonical ? (info.VolumeUUID ?? null) : null;
    },
    async detach(mountpoint) {
        // Normal detach refuses busy filesystems; never force an active process off disk.
        await run('hdiutil', ['detach', mountpoint]);
    },
    async compact(image) {
        assertMac();
        await run('hdiutil', ['compact', image]);
    },
};

/** Capped sparsebundle workspaces exist only on macOS; other hosts use plain directories. */
export const hostWorkspaceDisk: WorkspaceDisk | null =
    process.platform === 'darwin' ? macWorkspaceDisk : null;

function assertMac() {
    if (process.platform !== 'darwin') {
        throw new Error('Haus Computer capped workspaces require macOS.');
    }
}

async function run(command: string, args: string[]) {
    const result = await execute(command, args, { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
    return result.stdout;
}
