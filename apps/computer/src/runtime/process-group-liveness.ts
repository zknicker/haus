import { readdirSync, readFileSync } from 'node:fs';

/**
 * Whether any member of a process group can still run. Zombies count as exited:
 * in a Linux container whose PID 1 never reaps orphans, killed descendants stay
 * zombies forever and `kill(-pgid, 0)` keeps reporting the group alive.
 */
export function isProcessGroupAlive(processGroupId: number | undefined): boolean {
    if (processGroupId === undefined) {
        return false;
    }
    try {
        process.kill(-processGroupId, 0);
    } catch (error) {
        if (isSystemErrorCode(error, 'ESRCH')) {
            return false;
        }
        if (isSystemErrorCode(error, 'EPERM')) {
            return true;
        }
        throw error;
    }
    return process.platform === 'linux' ? hasLiveLinuxMember(processGroupId) : true;
}

export function isSystemErrorCode(error: unknown, code: string): boolean {
    return error instanceof Error && 'code' in error && error.code === code;
}

function hasLiveLinuxMember(processGroupId: number): boolean {
    for (const entry of readdirSync('/proc')) {
        if (!/^\d+$/u.test(entry)) {
            continue;
        }
        const stat = readProcStat(entry);
        if (stat && stat.processGroupId === processGroupId && stat.state !== 'Z') {
            return true;
        }
    }
    return false;
}

/** `/proc/<pid>/stat` is `pid (comm) state ppid pgrp …`; comm may contain spaces or parens. */
export function parseProcStat(line: string): { processGroupId: number; state: string } | null {
    const fields = line.slice(line.lastIndexOf(')') + 2).split(' ');
    const [state, , processGroup] = fields;
    const processGroupId = Number(processGroup);
    return state && Number.isInteger(processGroupId) ? { processGroupId, state } : null;
}

function readProcStat(pid: string) {
    try {
        return parseProcStat(readFileSync(`/proc/${pid}/stat`, 'utf8'));
    } catch {
        // The process exited between listing and reading.
        return null;
    }
}
