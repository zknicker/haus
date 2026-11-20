import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { WorkerRuntime } from '@haus/api';
import { computerEntrypoint } from '../../build-identity.ts';
import { runtimeSearchPath } from '../../runtime-discovery.ts';
import { createClaudeWorkerDriver } from '../../runtime/claude-code/claude-worker-driver.ts';
import { createCodexWorkerDriver } from '../../runtime/codex/codex-worker-driver.ts';
import type { RuntimeDriver } from '../../runtime/driver.ts';
import type { RuntimeProcessRegistry } from '../../runtime/process-registry.ts';
import type { RuntimeResumeState } from '../../runtime/resume-state.ts';
import type { WorkerLayout } from './layout.ts';

export interface WorkerHarnessLaunch {
    cwd: string;
    env: Record<string, string>;
    modelId: string | null;
    runtimeId: WorkerRuntime;
    writableRoots: readonly string[];
}

export type WorkerDriverFactory = (launch: WorkerHarnessLaunch) => RuntimeDriver;

export function workerDriverFactory(processes?: RuntimeProcessRegistry) {
    const homeDir = machineHome();
    const factory: WorkerDriverFactory = (launch) =>
        launch.runtimeId === 'claude-code'
            ? createClaudeWorkerDriver({ ...launch, homeDir, processes })
            : createCodexWorkerDriver({ ...launch, homeDir, processes });
    return factory;
}

export function workerResumeState(runtime: WorkerRuntime, sessionId: string | null) {
    if (sessionId === null) {
        return undefined;
    }
    return (
        runtime === 'claude-code'
            ? { claudeSessionId: sessionId, runtime: 'claude-code', version: 1 }
            : { runtime: 'codex', threadId: sessionId, version: 1 }
    ) satisfies RuntimeResumeState;
}

export async function prepareWorkerCli(layout: WorkerLayout, serverOrigin: string, token: string) {
    await mkdir(layout.bin, { mode: 0o700, recursive: true });
    await mkdir(layout.report, { mode: 0o700, recursive: true });
    const entrypoint = computerEntrypoint();
    const command = [entrypoint.executable, ...entrypoint.args, '__worker'].map(shellQuote);
    const wrapper = join(layout.bin, 'haus');
    await writeFile(
        wrapper,
        [
            '#!/bin/sh',
            `export HAUS_SERVER_URL=${shellQuote(serverOrigin)}`,
            `export HAUS_WORKER_REPORT_FILE=${shellQuote(layout.reportFile)}`,
            `exec ${command.join(' ')} "$@"`,
            '',
        ].join('\n'),
        { mode: 0o755 }
    );
    await chmod(wrapper, 0o755);
    return {
        HAUS_SERVER_URL: serverOrigin,
        HAUS_WORKER_TOKEN: token,
        PATH: [layout.bin, runtimeSearchPath({ homeDirectory: machineHome() })].join(':'),
    };
}

function machineHome() {
    return process.env.HAUS_COMPUTER_HOST_HOME ?? process.env.HOME ?? homedir();
}

function shellQuote(value: string) {
    return `'${value.replaceAll("'", `'"'"'`)}'`;
}
