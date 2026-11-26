import { type ChildProcess, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import { type ProcessExitFrame, processExitTailChars, processReadMaxBytes } from '@haus/api';
import { isProcessGroupAlive } from '../../runtime/process-group-liveness.ts';
import { killProcessTree, signalProcess } from '../pi/shell.ts';
import { exitStatus } from '../stream-process.ts';
import {
    createProcessRecords,
    type ProcessEnding,
    type ProcessRecord,
    readLogSlice,
    readLogTail,
    reportsExit,
} from './process-records.ts';

export const processKillGraceMs = 5000;

interface LiveProcess {
    child: ChildProcess;
    ending: ProcessEnding | null;
    exited: Promise<void>;
    record: ProcessRecord;
}

export interface ProcessStart {
    agentId: string;
    command: string;
    cwd: string;
    env: NodeJS.ProcessEnv;
    runId: string;
    sessionGeneration: number;
}

export type ProcessRegistry = ReturnType<typeof createProcessRegistry>;

export function createProcessRegistry(input: {
    agentsRoot: string;
    limit: number;
    send: (frame: ProcessExitFrame) => boolean;
}) {
    const records = createProcessRecords(input.agentsRoot);
    const live = new Map<string, LiveProcess>();
    const owners = new Map<string, string>();

    async function recoverLost() {
        const exitedAt = new Date().toISOString();
        for (const record of await records.list()) {
            owners.set(record.processId, record.agentId);
            if (record.exitedAt !== null) {
                continue;
            }
            killGroup(record.pid ?? undefined);
            await records.write({ ...record, ending: 'lost', exitCode: null, exitedAt });
        }
    }

    async function start(request: ProcessStart) {
        if (live.size >= input.limit) {
            return { kind: 'full' as const, limit: input.limit };
        }
        const processId = `prc_${randomBytes(12).toString('base64url')}`;
        const logPath = records.logPath(request.agentId, processId);
        await mkdir(records.directory(request.agentId), { mode: 0o700, recursive: true });
        const log = await open(logPath, 'a', 0o600);
        let child: ChildProcess;
        try {
            child = spawn('/bin/bash', ['-c', request.command], {
                cwd: request.cwd,
                detached: true,
                env: request.env,
                stdio: ['ignore', log.fd, log.fd],
            });
        } finally {
            await log.close();
        }
        const record: ProcessRecord = {
            agentId: request.agentId,
            command: request.command,
            ending: null,
            exitCode: null,
            exitedAt: null,
            pid: child.pid ?? null,
            processId,
            reportedAt: null,
            runId: request.runId,
            sessionGeneration: request.sessionGeneration,
            startedAt: new Date().toISOString(),
        };
        const written = records.write(record);
        const { promise: exited, resolve } = Promise.withResolvers<void>();
        const entry: LiveProcess = { child, ending: null, exited, record };
        live.set(processId, entry);
        owners.set(processId, request.agentId);
        let ended = false;
        const end = (exitCode: number | null) => {
            if (ended) {
                return;
            }
            ended = true;
            void written
                .then(() => finish(entry, exitCode))
                .catch((error: unknown) => console.error('Background process record failed.', error))
                .finally(resolve);
        };
        child.once('exit', (code) => {
            killGroup(child.pid);
            end(exitStatus(child, code));
        });
        child.once('error', () => end(null));
        await written;
        return { kind: 'started' as const, logPath, processId };
    }

    async function finish(entry: LiveProcess, exitCode: number | null) {
        const { processId } = entry.record;
        live.delete(processId);
        const ending = entry.ending ?? 'exited';
        const record: ProcessRecord = {
            ...entry.record,
            ending,
            exitCode,
            exitedAt: new Date().toISOString(),
        };
        await records.write(record);
        if (reportsExit(record)) {
            await report(record);
        }
    }

    async function report(record: ProcessRecord) {
        if (record.exitedAt === null) {
            return true;
        }
        const { size, tail } = await readLogTail(
            records.logPath(record.agentId, record.processId),
            processExitTailChars
        );
        return input.send({
            agentId: record.agentId,
            cursor: size,
            exitCode: record.exitCode,
            exitedAt: record.exitedAt,
            processId: record.processId,
            sessionGeneration: record.sessionGeneration,
            startedAt: record.startedAt,
            tail,
            type: 'process-exit',
        });
    }

    async function stop(entry: LiveProcess, ending: ProcessEnding) {
        entry.ending ??= ending;
        const { pid } = entry.child;
        if (pid !== undefined && isProcessGroupAlive(pid)) {
            signalProcess(-pid, 'SIGTERM');
        }
        const timer = setTimeout(() => killGroup(pid), processKillGraceMs);
        try {
            await entry.exited;
        } finally {
            clearTimeout(timer);
        }
    }

    return {
        acknowledge: async (processId: string) => {
            const agentId = owners.get(processId);
            const record = agentId === undefined ? null : await records.read(agentId, processId);
            if (record && record.exitedAt !== null && record.reportedAt === null) {
                await records.write({ ...record, reportedAt: new Date().toISOString() });
            }
        },
        kill: async (agentId: string, processId: string) => {
            const entry = live.get(processId);
            if (!entry || entry.record.agentId !== agentId) {
                return false;
            }
            await stop(entry, 'killed');
            return true;
        },
        recover: recoverLost,
        read: async (agentId: string, processId: string, afterSeq: number) => {
            const record = live.get(processId)?.record ?? (await records.read(agentId, processId));
            if (!record || record.agentId !== agentId) {
                return null;
            }
            const slice = await readLogSlice(
                records.logPath(agentId, processId),
                afterSeq,
                processReadMaxBytes
            );
            return { record, ...slice };
        },
        resend: async () => {
            const all = await records.list();
            const unreported = all
                .filter((record) => reportsExit(record) && record.reportedAt === null)
                .sort((a, b) => (a.exitedAt ?? '').localeCompare(b.exitedAt ?? ''));
            for (const record of unreported) {
                if (!(await report(record))) {
                    break;
                }
            }
            for (const processId of await records.prune(all, Date.now())) {
                owners.delete(processId);
            }
        },
        start,
        stopSession: async (
            agentId: string,
            scope: { before?: number; ending: 'archived' | 'revoked' }
        ) => {
            const entries = [...live.values()].filter(
                (entry) =>
                    entry.record.agentId === agentId &&
                    (scope.before === undefined || entry.record.sessionGeneration < scope.before)
            );
            await Promise.all(entries.map((entry) => stop(entry, scope.ending)));
        },
    };
}

function killGroup(pid: number | undefined) {
    if (pid !== undefined && isProcessGroupAlive(pid)) {
        killProcessTree(pid);
    }
}
