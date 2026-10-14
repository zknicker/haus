import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';

import type { ProcessListReader, ProcessRecord } from './types.ts';

const execFileAsync = promisify(execFile);

export class SystemProcessList implements ProcessListReader {
    async read(): Promise<ProcessRecord[]> {
        const { stdout } = await execFileAsync(
            '/bin/ps',
            ['-axo', 'pid=,ppid=,etime=,%cpu=,rss=,command='],
            { maxBuffer: 16 * 1024 * 1024, timeout: 10_000 }
        );
        const records = parseProcessList(stdout);
        return process.platform === 'linux'
            ? await Promise.all(records.map(withLinuxExecutablePath))
            : records;
    }
}

/**
 * Linux argv[0] is often a symlink or wrapper name (`exec -a "$0"`), so the
 * kernel-resolved executable also identifies the application.
 */
export function isApplicationProcess(record: ProcessRecord, executablePath: string): boolean {
    return (
        record.executablePath === executablePath || record.command.startsWith(`${executablePath} `)
    );
}

export function parseProcessList(output: string): ProcessRecord[] {
    return output
        .split('\n')
        .map(parseProcessLine)
        .filter((record): record is ProcessRecord => record !== null);
}

function parseProcessLine(line: string): ProcessRecord | null {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+(\d+)\s+(.+)$/);
    if (!match) {
        return null;
    }
    const [, pid, parentPid, etime, cpuPercent, rssKilobytes, command] = match;
    if (!(pid && parentPid && etime && cpuPercent && rssKilobytes && command)) {
        return null;
    }
    const elapsedSeconds = parseElapsedSeconds(etime);
    if (elapsedSeconds === null) {
        return null;
    }
    return {
        command,
        cpuPercent: Number(cpuPercent),
        elapsedSeconds,
        parentPid: Number(parentPid),
        pid: Number(pid),
        rssBytes: Number(rssKilobytes) * 1024,
    };
}

async function withLinuxExecutablePath(record: ProcessRecord): Promise<ProcessRecord> {
    if (!record.command.includes('--remote-debugging-port')) {
        return record;
    }
    try {
        return { ...record, executablePath: await fs.readlink(`/proc/${record.pid}/exe`) };
    } catch {
        return record;
    }
}

// ps etime formats: MM:SS, HH:MM:SS, or D-HH:MM:SS.
function parseElapsedSeconds(value: string): number | null {
    const [dayPart, clockPart] = value.includes('-')
        ? (value.split('-', 2) as [string, string])
        : ['0', value];
    const days = Number(dayPart);
    const segments = clockPart.split(':').map(Number);
    if (Number.isNaN(days) || segments.some(Number.isNaN)) {
        return null;
    }
    if (segments.length === 2) {
        const [minutes = 0, seconds = 0] = segments;
        return days * 86_400 + minutes * 60 + seconds;
    }
    if (segments.length === 3) {
        const [hours = 0, minutes = 0, seconds = 0] = segments;
        return days * 86_400 + hours * 3600 + minutes * 60 + seconds;
    }
    return null;
}
