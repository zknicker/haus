import { execFile } from 'node:child_process';
import { mkdir, realpath } from 'node:fs/promises';
import { promisify } from 'node:util';
import { z } from 'zod';

const execute = promisify(execFile);
const volumeInfoSchema = z.object({
    MountPoint: z.string().optional(),
    VolumeUUID: z.string().optional(),
});

/** A process with an open file, cwd, or mapping on a mounted workspace volume. */
export interface WorkspaceHolder {
    command: string;
    pid: number;
}

export interface WorkspaceDisk {
    compact(image: string): Promise<void>;
    create(image: string, capacityBytes: number): Promise<void>;
    /** Rejects with {@link WorkspaceVolumeBusyError} when the volume is in use. */
    detach(mountpoint: string, options?: { force: boolean }): Promise<void>;
    holders(mountpoint: string): Promise<WorkspaceHolder[]>;
    mount(image: string, mountpoint: string): Promise<string>;
    mountedUuid(mountpoint: string): Promise<string | null>;
    /** Canonical mountpoints of every mounted filesystem on this host. */
    mounts(): Promise<string[]>;
}

export class WorkspaceVolumeBusyError extends Error {
    constructor(
        readonly mountpoint: string,
        detail: string
    ) {
        super(`Workspace volume ${mountpoint} is busy: ${detail.trim()}`);
        this.name = 'WorkspaceVolumeBusyError';
    }
}

/** Runs a host command; failures reject with execFile's error (code, stdout, stderr). */
export type DiskCommandRunner = (command: string, args: readonly string[]) => Promise<string>;

/** DiskImages still exposes sparsebundle compaction through hdiutil. */
export function createMacWorkspaceDisk(run: DiskCommandRunner = runCommand): WorkspaceDisk {
    return {
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
            if (!(await this.mounts()).includes(canonical)) {
                return null;
            }
            const plist = await run('diskutil', ['info', '-plist', mountpoint]);
            const info = volumeInfoSchema.parse(await plistToJson(plist));
            return info.MountPoint === canonical ? (info.VolumeUUID ?? null) : null;
        },
        async mounts() {
            return parseMountpoints(await run('/sbin/mount', []));
        },
        async holders(mountpoint) {
            // Given a mountpoint, lsof reports every open file on that filesystem.
            const canonical = await realpath(mountpoint);
            try {
                return parseHolders(
                    await run('/usr/sbin/lsof', ['-n', '-P', '-w', '-F', 'pc', canonical])
                );
            } catch (error) {
                if (commandExitCode(error) === 1) {
                    // lsof exits 1 when nothing is open; keep any partial listing it printed.
                    return parseHolders(commandOutput(error, 'stdout'));
                }
                throw error;
            }
        },
        async detach(mountpoint, options) {
            // Normal detach refuses busy filesystems; callers force only as a logged last resort.
            const args = options?.force ? ['detach', '-force', mountpoint] : ['detach', mountpoint];
            try {
                await run('hdiutil', args);
            } catch (error) {
                const stderr = commandOutput(error, 'stderr');
                if (commandExitCode(error) === 16 || stderr.includes('Resource busy')) {
                    throw new WorkspaceVolumeBusyError(mountpoint, stderr);
                }
                throw error;
            }
        },
        async compact(image) {
            assertMac();
            await run('hdiutil', ['compact', image]);
        },
    };
}

export const macWorkspaceDisk: WorkspaceDisk = createMacWorkspaceDisk();

/** Capped sparsebundle workspaces exist only on macOS; other hosts use plain directories. */
export const hostWorkspaceDisk: WorkspaceDisk | null =
    process.platform === 'darwin' ? macWorkspaceDisk : null;

export function parseMountpoints(table: string): string[] {
    return table.split('\n').flatMap((line) => {
        const match = / on (.+) \([^)]*\)$/u.exec(line);
        return match?.[1] ? [match[1]] : [];
    });
}

export function parseHolders(listing: string): WorkspaceHolder[] {
    const holders: WorkspaceHolder[] = [];
    for (const line of listing.split('\n')) {
        if (line.startsWith('p')) {
            holders.push({ command: '', pid: Number(line.slice(1)) });
        } else if (line.startsWith('c')) {
            const last = holders.at(-1);
            if (last) {
                last.command = line.slice(1);
            }
        }
    }
    return holders.filter((holder) => Number.isSafeInteger(holder.pid) && holder.pid > 0);
}

function assertMac() {
    if (process.platform !== 'darwin') {
        throw new Error('Haus Computer capped workspaces require macOS.');
    }
}

async function runCommand(command: string, args: readonly string[]) {
    const result = await execute(command, [...args], {
        timeout: 120_000,
        maxBuffer: 4 * 1024 * 1024,
    });
    return result.stdout;
}

async function plistToJson(plist: string): Promise<unknown> {
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
    return JSON.parse(json);
}

function commandExitCode(error: unknown): unknown {
    return error instanceof Error && 'code' in error ? error.code : undefined;
}

function commandOutput(error: unknown, stream: 'stderr' | 'stdout'): string {
    if (error instanceof Error && stream in error) {
        const value: unknown = Reflect.get(error, stream);
        return typeof value === 'string' ? value : '';
    }
    return '';
}
