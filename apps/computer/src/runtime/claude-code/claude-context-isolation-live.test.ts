import { afterAll, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startHostToolServer } from '../../host-tools/mcp-server.ts';
import { ClaudeConnection } from './claude-connection.ts';
import { resolveClaudeCredentials } from './claude-credentials.ts';
import { ClaudeEventNormalizer } from './claude-event-normalizer.ts';
import { claudeInstallTarget, ensureClaudeInstall } from './claude-install.ts';
import {
    buildClaudeArgs,
    buildClaudeEnv,
    hostToolToken,
    renderClaudeMcpConfig,
    writeClaudeLaunchFiles,
} from './claude-launch.ts';
import { spawnClaudeProcess } from './claude-process.ts';

// Launches the pinned CLI as the driver does inside an Agent root seeded with canary CLAUDE.md
// files and MCP servers, then asks Claude Code what it loaded. No model call. The same launch
// without the isolation flags must see the canaries, so the probe proves something.
//   HAUS_RUN_LIVE_CLAUDE_CODE_TEST=1 bun test apps/computer/src/runtime/claude-code/claude-context-isolation-live.test.ts
const liveTest = process.env.HAUS_RUN_LIVE_CLAUDE_CODE_TEST === '1' ? test : test.skip;
const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-claude-isolation-live-')));
afterAll(() => rm(root, { force: true, recursive: true }));

const parent = join(root, 'parent');
const home = join(parent, 'agents', 'agt', 'home');
const workspace = join(parent, 'agents', 'agt', 'workspace');
const isolationFlags = new Set(['--setting-sources', 'user', '--strict-mcp-config']);

liveTest(
    'the Agent launch loads no CLAUDE.md, project MCP, or user MCP beyond Haus',
    async () => {
        await seedCanaries();
        const leaky = await probe((args) => args.filter((arg) => !isolationFlags.has(arg)));
        expect(leaky.memoryFiles).toEqual(expect.arrayContaining([join(workspace, 'CLAUDE.md')]));
        expect(leaky.mcpServers).toContain('operator-canary');
        const isolated = await probe((args) => args);
        expect(isolated.memoryFiles).toEqual([]);
        expect(isolated.mcpServers).toEqual(['haus']);
    },
    300_000
);

async function seedCanaries() {
    await mkdir(join(home, '.claude'), { recursive: true });
    await mkdir(join(parent, '.claude'), { recursive: true });
    await mkdir(workspace, { recursive: true });
    for (const path of [
        join(parent, 'CLAUDE.md'),
        join(parent, '.claude', 'CLAUDE.md'),
        join(workspace, 'CLAUDE.md'),
        join(workspace, 'CLAUDE.local.md'),
    ]) {
        await writeFile(path, 'CANARY\n');
    }
    const canaryServer = { mcpServers: { 'operator-canary': { command: 'true' } } };
    await writeFile(join(home, '.claude.json'), JSON.stringify(canaryServer));
    await writeFile(join(workspace, '.mcp.json'), JSON.stringify(canaryServer));
}

async function probe(adjust: (args: string[]) => string[]) {
    const server = startHostToolServer();
    const hostTools = server.openSession([]);
    const files = await writeClaudeLaunchFiles({
        dir: join(home, '.haus-runtime', 'claude-code'),
        instructions: 'Isolation probe.',
        mcpConfig: renderClaudeMcpConfig(hostTools.mcp),
    });
    const binaryPath = await ensureClaudeInstall(claudeInstallTarget());
    const baseEnv = { HOME: process.env.HOME, PATH: process.env.PATH, USER: process.env.USER };
    const child = spawnClaudeProcess({
        args: adjust(
            buildClaudeArgs({
                binaryPath,
                ...files,
                modelId: 'claude-haiku-4-5',
                reasoningEffort: 'default',
                sessionId: crypto.randomUUID(),
            })
        ),
        binaryPath,
        cwd: workspace,
        env: buildClaudeEnv({
            base: baseEnv,
            credentials: await resolveClaudeCredentials({ env: baseEnv }),
            homeDir: home,
            hostToolToken: hostToolToken(hostTools.mcp),
            launchEnv: {},
        }),
    });
    const connection = new ClaudeConnection(
        child,
        new ClaudeEventNormalizer({ hostServer: 'haus', strip: (value) => value }),
        hostTools,
        'probe',
        'probe'
    );
    try {
        const usage = (await connection.control({ subtype: 'get_context_usage' }, 60_000)) as {
            memoryFiles?: { path: string }[];
        };
        const status = (await connection.control({ subtype: 'mcp_status' }, 60_000)) as {
            mcpServers?: { name: string }[];
        };
        return {
            mcpServers: (status.mcpServers ?? []).map((entry) => entry.name).sort(),
            memoryFiles: (usage.memoryFiles ?? []).map((file) => file.path),
        };
    } finally {
        await connection.stop();
        await server.stop();
    }
}
