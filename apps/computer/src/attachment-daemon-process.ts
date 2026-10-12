import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

export interface AttachmentDaemonMarker {
    credentialHash: string | null;
    pid: number;
}

export type AttachmentDaemonStartPlan =
    | { kind: 'retain' }
    | { kind: 'restart'; pid: number }
    | { kind: 'start' };

export type AttachmentDaemonProcessInspection =
    | { kind: 'foreign' }
    | { kind: 'missing' }
    | { kind: 'verified' }
    | { kind: 'zombie' };

export type AttachmentDaemonProcessInspector = (
    pid: number,
    serverId: string
) => Promise<AttachmentDaemonProcessInspection>;

export interface ProcessRecord {
    command: string;
    state: string;
}

const execFileAsync = promisify(execFile);

export function attachmentCredentialHash(value: string) {
    return createHash('sha256').update(value).digest('hex');
}

/** Avoids a `ps` subprocess in the resident's 500ms supervision loop for children it spawned. */
export class AttachmentDaemonProcessRegistry {
    private readonly verifiedProcesses = new Map<string, { inspectedAt: number; pid: number }>();

    constructor(
        private readonly inspectProcess: AttachmentDaemonProcessInspector = inspectAttachmentDaemonProcess,
        private readonly isReachable: (pid: number) => boolean = isPidReachable,
        private readonly now: () => number = Date.now,
        private readonly reinspectionIntervalMs = 5000
    ) {}

    async inspect(pid: number, serverId: string): Promise<AttachmentDaemonProcessInspection> {
        const verified = this.verifiedProcesses.get(serverId);
        if (
            verified?.pid === pid &&
            this.isReachable(pid) &&
            this.now() - verified.inspectedAt < this.reinspectionIntervalMs
        ) {
            return { kind: 'verified' };
        }
        if (!this.isReachable(pid)) {
            this.verifiedProcesses.delete(serverId);
            return { kind: 'missing' };
        }
        const inspection = await this.inspectProcess(pid, serverId);
        if (inspection.kind === 'verified') {
            this.verifiedProcesses.set(serverId, { inspectedAt: this.now(), pid });
        } else {
            this.verifiedProcesses.delete(serverId);
        }
        return inspection;
    }

    async planStart(
        marker: AttachmentDaemonMarker | null,
        credentialHash: string,
        serverId: string
    ): Promise<AttachmentDaemonStartPlan> {
        const inspection = marker ? await this.inspect(marker.pid, serverId) : null;
        return planAttachmentDaemonStart(marker, credentialHash, inspection);
    }

    async verifiedPid(
        marker: AttachmentDaemonMarker | null,
        serverId: string
    ): Promise<number | null> {
        if (!marker) {
            return null;
        }
        return (await this.inspect(marker.pid, serverId)).kind === 'verified' ? marker.pid : null;
    }

    recordStarted(serverId: string, pid: number): void {
        this.verifiedProcesses.set(serverId, { inspectedAt: this.now(), pid });
    }

    recordExited(serverId: string, pid: number): void {
        if (this.verifiedProcesses.get(serverId)?.pid === pid) {
            this.verifiedProcesses.delete(serverId);
        }
    }
}

/** Distinguishes the expected daemon from zombies and PID reuse. */
export async function inspectAttachmentDaemonProcess(
    pid: number,
    serverId: string
): Promise<AttachmentDaemonProcessInspection> {
    const record = await readProcessRecord(pid);
    if (!record) {
        return { kind: 'missing' };
    }
    return classifyAttachmentDaemonProcess(record, serverId);
}

export function classifyAttachmentDaemonProcess(
    record: ProcessRecord,
    serverId: string
): AttachmentDaemonProcessInspection {
    if (record.state.startsWith('Z')) {
        return { kind: 'zombie' };
    }
    return commandRunsAttachmentDaemon(record.command, serverId)
        ? { kind: 'verified' }
        : { kind: 'foreign' };
}

export function planAttachmentDaemonStart(
    marker: AttachmentDaemonMarker | null,
    credentialHash: string,
    inspection: AttachmentDaemonProcessInspection | null
): AttachmentDaemonStartPlan {
    if (!(marker && inspection?.kind === 'verified')) {
        return { kind: 'start' };
    }
    if (marker.credentialHash === credentialHash) {
        return { kind: 'retain' };
    }
    return { kind: 'restart', pid: marker.pid };
}

export function parseProcessRecord(output: string): ProcessRecord | null {
    const match = /^\s*(\S+)\s+([\s\S]*\S)\s*$/u.exec(output);
    if (!(match?.[1] && match[2])) {
        return null;
    }
    return { command: match[2], state: match[1] };
}

export function commandRunsAttachmentDaemon(command: string, serverId: string): boolean {
    const argumentsPattern = new RegExp(
        `(?:^|\\s)__attachment-daemon\\s+${escapeRegExp(serverId)}(?:\\s|$)`,
        'u'
    );
    return argumentsPattern.test(command);
}

export async function readAttachmentDaemonMarker(
    path: string
): Promise<AttachmentDaemonMarker | null> {
    try {
        const contents = await readFile(path, 'utf8');
        const legacyPid = Number.parseInt(contents, 10);
        if (Number.isSafeInteger(legacyPid) && legacyPid > 0) {
            return { credentialHash: null, pid: legacyPid };
        }
        const marker: unknown = JSON.parse(contents);
        if (!(isRecord(marker) && isCredentialHash(marker.credentialHash) && isPid(marker.pid))) {
            return null;
        }
        return { credentialHash: marker.credentialHash, pid: marker.pid };
    } catch {
        return null;
    }
}

async function readProcessRecord(pid: number): Promise<ProcessRecord | null> {
    try {
        const { stdout } = await execFileAsync('/bin/ps', [
            '-o',
            'state=',
            '-o',
            'command=',
            '-p',
            String(pid),
        ]);
        return parseProcessRecord(stdout);
    } catch {
        return null;
    }
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function isPidReachable(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isCredentialHash(value: unknown): value is string {
    return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function isPid(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
