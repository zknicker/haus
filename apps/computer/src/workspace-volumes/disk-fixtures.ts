import {
    createMacWorkspaceDisk,
    type DiskCommandRunner,
    type WorkspaceDisk,
} from './disk-image.ts';
import type { DetachPacing } from './volume-detach.ts';

type DetachResult = 'busy' | 'missing' | 'ok';
export interface FakeHdiutil {
    calls: string[][];
    disk: WorkspaceDisk;
    mounted: Set<string>;
    pacing: DetachPacing;
    sleeps: number[];
}

/**
 * The real macOS disk adapter over a scripted hdiutil, lsof, and mount table, so tests
 * exercise busy parsing and retries without DiskImages. `holders` returns lsof `-F pc`
 * output; an empty string is lsof's exit 1 for an unused volume.
 */
export function fakeHdiutil(script: {
    detach(attempt: number, force: boolean): DetachResult;
    holders?(poll: number): string;
    mounted?: readonly string[];
    uuid?: string;
}): FakeHdiutil {
    const calls: string[][] = [];
    const mounted = new Set(script.mounted ?? []);
    const sleeps: number[] = [];
    let detaches = 0;
    let polls = 0;
    const run: DiskCommandRunner = async (command, args) => {
        calls.push([command, ...args]);
        if (command === '/sbin/mount') {
            return [...mounted]
                .map((path, index) => `/dev/disk${index}s1 on ${path} (apfs, local, nobrowse)`)
                .join('\n');
        }
        if (command === '/usr/sbin/lsof') {
            const listing = script.holders?.(polls++) ?? '';
            if (!listing) {
                throw commandError('lsof', 1, '');
            }
            return listing;
        }
        if (command === 'hdiutil' && args[0] === 'detach') {
            const force = args.includes('-force');
            const result = script.detach(++detaches, force);
            if (result === 'busy') {
                throw commandError(
                    'hdiutil',
                    16,
                    `hdiutil: couldn't unmount "disk29" - Resource busy\n`
                );
            }
            if (result === 'missing') {
                throw commandError('hdiutil', 1, 'hdiutil: detach failed - No such file\n');
            }
            mounted.delete(args.at(-1) ?? '');
            return '';
        }
        throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    };
    const uuid = script.uuid ?? 'volume-uuid';
    const disk: WorkspaceDisk = {
        ...createMacWorkspaceDisk(run),
        // diskutil and plutil are host tools; identity here follows the scripted mount table.
        mountedUuid: async (path) => (mounted.has(path) ? uuid : null),
    };
    const pacing: DetachPacing = {
        backoffMs: [250, 500, 1000, 2000],
        holderPollMs: 250,
        holderPolls: 4,
        sleep: async (ms) => {
            sleeps.push(ms);
        },
    };
    return { calls, disk, mounted, pacing, sleeps };
}

export function holderListing(...holders: [pid: number, command: string][]): string {
    return holders.map(([pid, command]) => `p${pid}\nc${command}\n`).join('');
}

function commandError(command: string, code: number, stderr: string) {
    return Object.assign(new Error(`Command failed: ${command}\n${stderr}`), {
        code,
        stderr,
        stdout: '',
    });
}
