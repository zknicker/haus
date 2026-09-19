import { afterAll, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createGrokBuild } from '@ai-sdk/harness-grok-build';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { createLocalTrustedSandboxProvider } from './sandbox.ts';

const grokPreflight = await checkLocalGrok();
const liveTest = grokPreflight.available ? test : test.skip;
const runtime = makeDaemonRuntime();

afterAll(() => runtime.dispose());

liveTest(
    `installed Grok accepts a live interjection during an active turn${
        grokPreflight.available ? '' : ` (${grokPreflight.reason})`
    }`,
    async () => {
        const temporaryRoot = await mkdtemp(join(tmpdir(), 'haus-grok-interjection-'));
        const rootDir = await realpath(temporaryRoot);
        const homeDir = join(rootDir, 'home');
        const workspaceDir = join(rootDir, 'workspace');
        await mkdir(workspaceDir, { recursive: true });

        const agent = new HarnessAgent({
            harness: createGrokBuild(),
            model: 'grok-4.6',
            permissionMode: 'allow-all',
            sandbox: createLocalTrustedSandboxProvider({
                authProfiles: ['grok-build'],
                env: {
                    GROK_HOME: join(homeDir, '.grok'),
                    HOME: homeDir,
                },
                homeDir,
                rootDir,
                runtime,
            }),
            sandboxConfig: { workDir: 'workspace' },
        });
        const session = await agent.createSession();

        try {
            const result = await agent.stream({
                abortSignal: AbortSignal.timeout(45_000),
                prompt: 'Run the shell command `sleep 5`. After it finishes, reply with exactly ORIGINAL and nothing else.',
                session,
            });
            let delivered = false;
            for await (const part of result.fullStream) {
                if (part.type === 'tool-call' && !delivered) {
                    await session.experimental_steerTurn(
                        'Change the final reply to exactly INTERJECTED and nothing else.'
                    );
                    delivered = true;
                }
            }

            expect(delivered).toBe(true);
            expect((await result.text).trim()).toBe('INTERJECTED');
        } finally {
            await session.destroy();
            await rm(temporaryRoot, { force: true, recursive: true });
        }
    },
    60_000
);

async function checkLocalGrok(): Promise<
    { available: true } | { available: false; reason: string }
> {
    const executable = Bun.which('grok');
    if (!executable) {
        return { available: false, reason: 'local grok executable is missing' };
    }

    try {
        const subprocess = Bun.spawn([executable, 'models'], {
            stderr: 'pipe',
            stdin: 'ignore',
            stdout: 'pipe',
        });
        const stdoutPromise = new Response(subprocess.stdout).text();
        const stderrPromise = new Response(subprocess.stderr).text();
        let timedOut = false;
        const timeout = setTimeout(() => {
            timedOut = true;
            subprocess.kill();
        }, 10_000);
        const [exitCode, stdout, stderr] = await Promise.all([
            subprocess.exited,
            stdoutPromise,
            stderrPromise,
        ]);
        clearTimeout(timeout);

        if (timedOut) {
            return { available: false, reason: 'local grok login check timed out' };
        }
        const output = `${stdout}\n${stderr}`;
        if (
            exitCode !== 0 ||
            !stdout.includes('You are logged in with') ||
            /authentication required|failed to fetch models|not authenticated/i.test(output)
        ) {
            return { available: false, reason: 'local grok login is unavailable' };
        }
        return { available: true };
    } catch {
        return { available: false, reason: 'local grok login check failed' };
    }
}
