import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentStartCommand } from './agent-commands.ts';
import { composeInboxDrain } from './inbox-format.ts';
import { writeTrace } from './launch-trace.ts';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const fakeRuntimePath = resolve(moduleDir, 'fake-runtime.ts');

/** Deterministic local model with the real managed CLI and loopback output path. */
export async function runFakeRuntime(input: {
    agentEnv: Record<string, string>;
    command: AgentStartCommand;
    dirs: { home: string; runtime: string; workspace: string };
    signal?: AbortSignal;
}): Promise<'completed' | 'failed' | 'interrupted'> {
    const child = Bun.spawn([process.execPath, fakeRuntimePath], {
        cwd: input.dirs.workspace,
        env: {
            ...process.env,
            ...input.agentEnv,
            HAUS_TURN_PROMPT: composeInboxDrain(input.command.inbox ?? []),
            HOME: input.dirs.home,
        },
        signal: input.signal,
        stderr: 'pipe',
        stdout: 'pipe',
    });
    const [out, err, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ]);
    await writeTrace(input, `${out}${err}`);
    return input.signal?.aborted ? 'interrupted' : exitCode === 0 ? 'completed' : 'failed';
}
