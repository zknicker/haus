import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { InvocationClient } from '../invocations/invocation-client.ts';
import { invocationText, invocationToolOutcome } from '../invocations/invocation-client.ts';
import type { RunAuthority, ToolOutcome } from '../run-context.ts';
import { hausCommandAccess } from './command-access.ts';
import type { HausProxy } from './haus-proxy.ts';
import { repoCheckoutCall, runRepoCheckout } from './repo-checkout.ts';
import {
    type MachinePath,
    machinePathOf,
    planMachinePaths,
    restoreMachinePaths,
} from './machine-paths.ts';

const agentCliEntrypoint = fileURLToPath(import.meta.resolve('@haus/agent-cli/bin'));

const machineFileReadMaxBytes = 256 * 1024 ** 2;

export async function runHausCommand(input: {
    argv: readonly string[];
    authority: RunAuthority;
    invocations: InvocationClient;
    proxy: HausProxy;
    signal: AbortSignal;
    stdin: string | null;
    timeoutMs: number;
    toolCallId: string;
}) {
    const access = hausCommandAccess(input.argv);
    if (access.kind === 'refused') {
        return refusal(access.text);
    }
    if (access.kind === 'repo-checkout') {
        const checkout = repoCheckoutCall(input.argv.slice(2));
        if (checkout.kind === 'refused') {
            return refusal(checkout.text);
        }
        if (checkout.kind === 'invoke') {
            return runRepoCheckout(checkout.operation, input);
        }
    }
    const machineFlags = access.kind === 'run' ? access.machineFlags : [];
    const root = await mkdtemp(join(tmpdir(), 'haus-runner-cli-'));
    const workdir = join(root, 'work');
    await mkdir(workdir);
    await mkdir(join(root, 'home'));
    try {
        const plan = planMachinePaths(input.argv, machineFlags);
        for (const path of plan.paths) {
            await mkdir(dirname(join(workdir, path.standIn)), { recursive: true });
            if (path.direction === 'read') {
                const refusal = await readMachineFile(path, workdir, input);
                if (refusal) {
                    return refusal;
                }
            }
        }
        const run = await spawnAgentCli({ ...input, argv: plan.argv, root, workdir });
        const notes = machineFlags.some((flag) => flag.direction === 'write')
            ? await writeMachineFiles(workdir, plan.paths, input)
            : [];
        const text = [restoreMachinePaths(run.output, plan.paths), ...notes, ...run.notes]
            .filter((part) => part.length > 0)
            .join('\n');
        return {
            content: [{ text, type: 'text' }],
            isError: run.exitCode !== 0 || notes.length > 0,
        } satisfies ToolOutcome;
    } finally {
        await rm(root, { force: true, recursive: true });
    }
}

async function spawnAgentCli(input: {
    argv: readonly string[];
    authority: RunAuthority;
    proxy: HausProxy;
    root: string;
    signal: AbortSignal;
    stdin: string | null;
    timeoutMs: number;
    toolCallId: string;
    workdir: string;
}) {
    const call = input.proxy.openCall(input.toolCallId);
    const tokenFile = join(input.root, 'agent-token');
    await writeFile(tokenFile, call.token, { mode: 0o600 });
    const timeout = AbortSignal.timeout(input.timeoutMs);
    const signal = AbortSignal.any([input.signal, timeout]);
    try {
        const child = Bun.spawn([process.execPath, agentCliEntrypoint, ...input.argv], {
            cwd: input.workdir,
            env: {
                HAUS_AGENT_ID: input.authority.agentId,
                HAUS_AGENT_PROXY_TOKEN_FILE: tokenFile,
                HAUS_AGENT_PROXY_URL: input.proxy.url,
                HAUS_AGENT_TOKEN_FILE: tokenFile,
                HAUS_SERVER_URL: input.proxy.url,
                HOME: join(input.root, 'home'),
                NO_COLOR: '1',
                PATH: process.env.PATH ?? '/usr/bin:/bin',
                ...(process.env.TZ ? { TZ: process.env.TZ } : {}),
            },
            signal,
            stderr: 'pipe',
            stdin: input.stdin === null ? 'ignore' : Buffer.from(input.stdin),
            stdout: 'pipe',
        });
        const [stdout, stderr, exitCode] = await Promise.all([
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
            child.exited,
        ]);
        const notes = [
            ...(timeout.aborted ? [`Timed out after ${input.timeoutMs / 1000} s.`] : []),
            ...(input.signal.aborted ? ['Cancelled before it finished.'] : []),
            ...(exitCode === 0 ? [] : [`Exit code: ${exitCode}`]),
        ];
        return { exitCode, notes, output: `${stdout}${stderr}`.trimEnd() };
    } finally {
        call.close();
    }
}

async function readMachineFile(
    path: MachinePath,
    workdir: string,
    input: { invocations: InvocationClient; signal: AbortSignal; toolCallId: string }
) {
    const answer = await input.invocations.invoke(
        input.toolCallId,
        { kind: 'file-read', maxBytes: machineFileReadMaxBytes, path: path.machinePath },
        { signal: input.signal }
    );
    if (answer.frame.outcome !== 'completed') {
        return invocationToolOutcome(answer);
    }
    if (answer.frame.output.kind !== 'inline') {
        return refusal(`${path.machinePath} was not read. ${invocationText(answer)}`);
    }
    await writeFile(join(workdir, path.standIn), Buffer.from(answer.frame.output.base64, 'base64'));
    return null;
}

async function writeMachineFiles(
    workdir: string,
    paths: readonly MachinePath[],
    input: { invocations: InvocationClient; signal: AbortSignal; toolCallId: string }
) {
    const notes: string[] = [];
    for (const file of await filesUnder(workdir)) {
        const machinePath = machinePathOf(relative(workdir, file), paths);
        const answer = await input.invocations.writeFile(
            input.toolCallId,
            { bytes: await readFile(file), mode: 0o600, path: machinePath },
            { signal: input.signal }
        );
        if (answer.frame.outcome !== 'completed') {
            notes.push(`${machinePath} was not written to the machine.`);
            notes.push(invocationText(answer));
        }
    }
    return notes;
}

async function filesUnder(dir: string) {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile() && !entry.parentPath.includes('machine-reads'))
        .map((entry) => join(entry.parentPath, entry.name))
        .toSorted();
}

function refusal(text: string) {
    return { content: [{ text, type: 'text' }], isError: true } satisfies ToolOutcome;
}
