import { basename } from 'node:path';
import type { MachineFlag, MachinePathDirection } from './command-access.ts';

export interface MachinePath {
    readonly direction: MachinePathDirection;
    readonly machinePath: string;
    readonly standIn: string;
}

const attachmentIdPattern = /^[a-z]{2,6}_[A-Za-z0-9_-]+$/u;

export function planMachinePaths(argv: readonly string[], flags: readonly MachineFlag[]) {
    const paths: MachinePath[] = [];
    const rewritten = argv.map((value, index) => {
        const flag = flags.find((entry) => entry.flag === argv[index - 1]);
        if (!flag || (flag.flag === '--reference' && attachmentIdPattern.test(value))) {
            return value;
        }
        const prefix = flag.direction === 'read' ? 'machine-reads' : 'machine-writes';
        const standIn = `${prefix}/${paths.length}/${standInName(value)}`;
        paths.push({ direction: flag.direction, machinePath: value, standIn });
        return standIn;
    });
    return { argv: rewritten, paths };
}

export function machinePathOf(relativePath: string, paths: readonly MachinePath[]) {
    const match = paths.find(
        (path) =>
            path.direction === 'write' &&
            (relativePath === path.standIn || relativePath.startsWith(`${path.standIn}/`))
    );
    return match ? `${match.machinePath}${relativePath.slice(match.standIn.length)}` : relativePath;
}

export function restoreMachinePaths(text: string, paths: readonly MachinePath[]) {
    return paths.reduce((result, path) => result.replaceAll(path.standIn, path.machinePath), text);
}

function standInName(value: string) {
    const name = basename(value);
    return name === '' || name === '.' || name === '..' ? 'file' : name;
}
