import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type HostToolServer, startHostToolServer } from '../../../host-tools/mcp-server.ts';
import type { RuntimeDriver } from '../../driver.ts';
import { type ClaudeCodeDriverOptions, createClaudeCodeDriver } from '../claude-code-driver.ts';
import { type ClaudeWarmPool, createClaudeWarmPool } from '../claude-warm-pool.ts';

export interface FakeLaunch {
    args: string[];
    env: Record<string, unknown>;
    pid: number;
}

/** A driver over `fake-claude.ts` in a throwaway Agent root, with its own pool and MCP server. */
export async function createFakeDriverHarness() {
    const root = await mkdtemp(join(tmpdir(), 'haus-claude-driver-'));
    const homeDir = join(root, 'home');
    const workspaceDir = join(root, 'workspace');
    await mkdir(homeDir, { recursive: true });
    await mkdir(workspaceDir, { recursive: true });
    const binaryPath = join(root, 'claude');
    await writeFile(
        binaryPath,
        `#!/bin/sh\nexec "${process.execPath}" "${join(import.meta.dir, 'fake-claude.ts')}" "$@"\n`
    );
    await chmod(binaryPath, 0o755);
    const log = join(root, 'launches.jsonl');
    const server: HostToolServer = startHostToolServer();
    const pool: ClaudeWarmPool = createClaudeWarmPool();
    const driver = (overrides: Partial<ClaudeCodeDriverOptions> = {}): RuntimeDriver =>
        createClaudeCodeDriver({
            baseEnv: { CLAUDECODE: '1', FAKE_CLAUDE_LOG: log, PATH: process.env.PATH },
            binaryPath,
            credentials: () => Promise.resolve({ CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat-secret' }),
            env: { HAUS_AGENT_ID: 'agt_test' },
            homeDir,
            hostToolServer: server,
            instructions: 'You are a test Agent.',
            modelId: 'claude-haiku-4-5',
            pool,
            reasoningEffort: 'medium',
            tools: [],
            workspaceDir,
            ...overrides,
        });
    return {
        driver,
        homeDir,
        async launches(): Promise<FakeLaunch[]> {
            try {
                return (await readFile(log, 'utf8'))
                    .split('\n')
                    .filter(Boolean)
                    .map((line) => JSON.parse(line) as FakeLaunch);
            } catch {
                return [];
            }
        },
        pool,
        async close() {
            await server.stop();
            await rm(root, { force: true, recursive: true });
        },
        root,
    };
}

export function signal(): AbortSignal {
    return new AbortController().signal;
}
