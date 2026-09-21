import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createHarnessForRuntime } from './runtime-harness.ts';

test('the shipped Claude bridge keeps live credentials out of both recovery files', async () => {
    const bootstrap = await createHarnessForRuntime('claude-code', 'medium').getBootstrap?.();
    const bridge = bootstrap?.files.find((file) => file.path.endsWith('/bridge.mjs'))?.content;
    if (typeof bridge !== 'string') {
        throw new Error('Missing shipped Claude bridge');
    }

    // Exercise the bundled persistence function without launching a vendor runtime.
    const start = bridge.indexOf('  const writeStartConfig = async (start) => {');
    const end = bridge.indexOf('  const emit = ', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const root = await mkdtemp(join(tmpdir(), 'haus-claude-persistence-'));
    const startConfigPath = join(root, 'start-config.json');
    const rerunStartConfigPath = join(root, 'rerun-start-config.json');
    const message = {
        type: 'start',
        model: 'test-model',
        env: {
            ANTHROPIC_API_KEY: 'test-api-secret',
            ANTHROPIC_AUTH_TOKEN: 'test-auth-secret',
            CLAUDE_CODE_OAUTH_TOKEN: 'test-oauth-secret',
            AI_GATEWAY_API_KEY: 'test-gateway-secret',
            HAUS_CLAUDE_USAGE_REFRESH: '1',
            ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
        },
    };
    try {
        await runInNewContext(`${bridge.slice(start, end)}\nwriteStartConfig(message)`, {
            existsSync,
            message,
            rerunStartConfigPath,
            startConfigPath,
            writeFile,
        });
        for (const path of [startConfigPath, rerunStartConfigPath]) {
            expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
                type: 'start',
                model: 'test-model',
                env: {
                    HAUS_CLAUDE_USAGE_REFRESH: '1',
                    ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
                },
            });
        }
        expect(message.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('test-oauth-secret');
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
