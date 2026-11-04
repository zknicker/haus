import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type EffectRuntime, settle } from '@haus/effect';
import {
    liveReminderScriptExecution,
    type ReminderScriptExecutionRunner,
} from './reminder-script-execution.ts';
import { runtimeSearchPath } from './runtime-discovery.ts';
import { secretsPaths } from './secrets/store.ts';

export interface ReminderScriptCommand {
    agentId: string;
    attentionId: string;
    fireId: string;
    reminderId: string;
    script: string;
    type: 'reminder-script';
}

export interface ReminderScriptResult {
    agentId: string;
    attentionId: string;
    /** Wall-clock time the script ran for. */
    durationMs: number;
    exitCode: number;
    fireId: string;
    output: string;
    timedOut: boolean;
    type: 'reminder-script-result';
}

const runningScripts = new Map<string, Promise<ReminderScriptResult>>();

export function parseReminderScriptCommand(frame: unknown): ReminderScriptCommand | null {
    if (
        !isRecord(frame) ||
        frame.type !== 'reminder-script' ||
        !['agentId', 'attentionId', 'fireId', 'reminderId', 'script'].every(
            (field) => typeof frame[field] === 'string' && frame[field].length > 0
        ) ||
        Buffer.byteLength(frame.script as string) > 16_384
    ) {
        return null;
    }
    return frame as unknown as ReminderScriptCommand;
}

/** Executes once in the Agent workspace; a redelivered command replays the durable result. */
export async function runReminderScript(input: {
    command: ReminderScriptCommand;
    dataRoot: string;
    runtime: EffectRuntime<never>;
    serverId: string;
}): Promise<ReminderScriptResult> {
    return await runReminderScriptWithExecution(input, liveReminderScriptExecution);
}

export async function runReminderScriptWithExecution(
    input: {
        command: ReminderScriptCommand;
        dataRoot: string;
        runtime: EffectRuntime<never>;
        serverId: string;
    },
    executionRunner: ReminderScriptExecutionRunner
): Promise<ReminderScriptResult> {
    const agentRoot = join(
        input.dataRoot,
        'servers',
        input.serverId,
        'agents',
        input.command.agentId
    );
    const resultDir = join(agentRoot, 'runtime', 'reminder-results');
    const resultPath = join(resultDir, `${input.command.attentionId}.json`);
    const running = runningScripts.get(resultPath);
    if (running) {
        return running;
    }
    const execution = executeReminderScript({
        ...input,
        agentRoot,
        executionRunner,
        resultDir,
        resultPath,
    });
    runningScripts.set(resultPath, execution);
    try {
        return await execution;
    } finally {
        if (runningScripts.get(resultPath) === execution) {
            runningScripts.delete(resultPath);
        }
    }
}

async function executeReminderScript(
    input: Parameters<typeof runReminderScript>[0] & {
        agentRoot: string;
        executionRunner: ReminderScriptExecutionRunner;
        resultDir: string;
        resultPath: string;
    }
): Promise<ReminderScriptResult> {
    const prior = await readResult(input.resultPath);
    if (prior) {
        return prior;
    }
    const workspace = join(input.agentRoot, 'workspace');
    const home = join(input.agentRoot, 'home');
    await Promise.all([
        mkdir(input.resultDir, { mode: 0o700, recursive: true }),
        mkdir(workspace, { mode: 0o700, recursive: true }),
        mkdir(home, { mode: 0o700, recursive: true }),
    ]);

    const startedAt = Date.now();
    const execution = await runExecution(
        input.runtime,
        input.executionRunner({
            cwd: workspace,
            env: reminderScriptEnvironment(home, input.dataRoot, input.serverId),
            script: input.command.script,
        })
    );
    const result: ReminderScriptResult = {
        agentId: input.command.agentId,
        attentionId: input.command.attentionId,
        durationMs: Date.now() - startedAt,
        exitCode: execution.exitCode,
        fireId: input.command.fireId,
        output: execution.output,
        timedOut: execution.timedOut,
        type: 'reminder-script-result',
    };
    const temporary = `${input.resultPath}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(result), { mode: 0o600 });
    await rename(temporary, input.resultPath);
    return result;
}

async function runExecution(
    runtime: EffectRuntime<never>,
    execution: ReturnType<ReminderScriptExecutionRunner>
) {
    return await settle(runtime, execution);
}

/**
 * The same PATH the Agent's own shell commands get, minus the live-turn-only
 * pieces (the proxy-backed `haus` wrapper and a specific launched runtime's own
 * directory) a standalone reminder script run has no equivalent of: the
 * Owner's `haus-secrets` install, when connected, then the stable service PATH
 * (`agentPath` in agent-path.ts composes the full set for a live Agent turn).
 */
function reminderScriptEnvironment(
    home: string,
    dataRoot: string,
    serverId: string
): Record<string, string> {
    const environment: Record<string, string> = {
        HOME: home,
        PATH: [secretsPaths(dataRoot, serverId).binDir, runtimeSearchPath()].join(':'),
    };
    for (const name of ['LANG', 'LC_ALL', 'TMPDIR'] as const) {
        const value = process.env[name];
        if (value) {
            environment[name] = value;
        }
    }
    return environment;
}

async function readResult(path: string): Promise<ReminderScriptResult | null> {
    try {
        const value = JSON.parse(await readFile(path, 'utf8')) as unknown;
        return isResult(value) ? value : null;
    } catch {
        return null;
    }
}

function isResult(value: unknown): value is ReminderScriptResult {
    return (
        isRecord(value) &&
        value.type === 'reminder-script-result' &&
        typeof value.agentId === 'string' &&
        typeof value.attentionId === 'string' &&
        typeof value.fireId === 'string' &&
        typeof value.durationMs === 'number' &&
        typeof value.exitCode === 'number' &&
        typeof value.output === 'string' &&
        typeof value.timedOut === 'boolean'
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
