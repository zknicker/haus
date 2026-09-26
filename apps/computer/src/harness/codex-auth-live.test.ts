import { afterAll, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { classifyRuntimeFailure } from '../runtime-failure.ts';
import { bridgeStoreDirForHost } from './bridge-bootstrap.ts';
import { createHarnessForRuntime } from './runtime-harness.ts';
import { readRuntimeSessionFailure } from './runtime-session-failure.ts';
import { createLocalTrustedSandboxProvider } from './sandbox.ts';
import { observeTurnStream } from './turn-stream.ts';

// Opt-in: reaches OpenAI with a deliberately invalid key, so it spends no quota and needs no
// login. Run with HAUS_RUN_LIVE_CODEX_TEST=1 bun test apps/computer/src/harness/codex-auth-live.test.ts
const liveTest = process.env.HAUS_RUN_LIVE_CODEX_TEST === '1' ? test : test.skip;
const runtime = makeDaemonRuntime();

afterAll(() => runtime.dispose());

liveTest(
    'a rejected Codex credential fails the turn at its first retry instead of after ten',
    async () => {
        const rootDir = await realpath(await mkdtemp(join(tmpdir(), 'haus-codex-auth-live-')));
        const homeDir = join(rootDir, 'home');
        await mkdir(join(homeDir, '.codex'), { recursive: true });
        await mkdir(join(rootDir, 'workspace'), { recursive: true });
        await writeFile(
            join(homeDir, '.codex', 'auth.json'),
            JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: 'sk-proj-haus-invalid-0000' })
        );
        const agent = new HarnessAgent({
            harness: createHarnessForRuntime('codex', 'default', false, bridgeStoreDirForHost()),
            model: 'gpt-5.6-luna',
            permissionMode: 'allow-all',
            sandbox: createLocalTrustedSandboxProvider({
                env: { CODEX_HOME: join(homeDir, '.codex'), HOME: homeDir, OPENAI_API_KEY: '' },
                homeDir,
                rootDir,
                runtime,
            }),
            sandboxConfig: { workDir: 'workspace' },
        });
        const session = await agent.createSession();
        try {
            let retries = 0;
            const turn = await agent.stream({ prompt: 'Reply with OK.', session });
            const failure = await observeTurnStream(
                countRetries(turn.fullStream, () => {
                    retries += 1;
                }),
                undefined,
                undefined,
                { runtime }
            ).catch((error: unknown) => error);

            expect(retries).toBe(1);
            expect(classifyRuntimeFailure((failure as { cause?: unknown }).cause)).toBe(
                'authentication'
            );
        } finally {
            await session.destroy().catch(() => undefined);
            await rm(rootDir, { force: true, recursive: true });
        }
    },
    120_000
);

async function* countRetries(stream: AsyncIterable<unknown>, onRetry: () => void) {
    for await (const part of stream) {
        const rawValue = (part as { type?: unknown; rawValue?: unknown }).rawValue;
        if (readRuntimeSessionFailure(rawValue)?.title.startsWith('Reconnecting')) {
            onRetry();
        }
        yield part;
    }
}
