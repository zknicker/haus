import { afterAll, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { bridgeStoreDirForHost } from './bridge-bootstrap.ts';
import { CLAUDE_SETTING_SOURCES, createHarnessForRuntime } from './runtime-harness.ts';
import { createLocalTrustedSandboxProvider } from './sandbox.ts';

// Installs the pinned Computer bridge (network on a cold store) and asks the real Claude Agent
// SDK which memory files, skills, and MCP servers it loaded. No model call: the prompt stream
// never yields.
const liveTest = process.env.HAUS_RUN_LIVE_CLAUDE_CONTEXT_TEST === '1' ? test : test.skip;

const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-claude-context-live-')));
afterAll(() => rm(root, { force: true, recursive: true }));

liveTest(
    'Claude Code loads no CLAUDE.md, ancestor skills, or host MCP servers under the Agent setup',
    async () => {
        const sdk = await installBridgeSdk(join(root, 'bridge'));
        const parent = join(root, 'parent');
        const agentRoot = join(parent, 'servers', 'srv', 'agents', 'agt');
        const home = join(agentRoot, 'home');
        const hostHome = join(root, 'host');
        const workspace = join(agentRoot, 'workspace');
        const skillDir = join(home, '.claude', 'skills', 'probe-skill');
        const ancestorSkillDir = join(parent, '.claude', 'skills', 'ancestor-skill');
        await mkdir(ancestorSkillDir, { recursive: true });
        await mkdir(skillDir, { recursive: true });
        await mkdir(workspace, { recursive: true });
        await mkdir(hostHome, { recursive: true });
        for (const path of [
            join(parent, 'CLAUDE.md'),
            join(parent, 'AGENTS.md'),
            join(parent, '.claude', 'CLAUDE.md'),
            join(workspace, 'CLAUDE.md'),
            join(workspace, 'CLAUDE.local.md'),
            join(workspace, 'AGENTS.md'),
        ]) {
            await writeFile(path, 'CANARY\n');
        }
        await writeFile(join(skillDir, 'SKILL.md'), skill('probe-skill'));
        await writeFile(join(ancestorSkillDir, 'SKILL.md'), skill('ancestor-skill'));
        await writeFile(
            join(hostHome, '.claude.json'),
            JSON.stringify({ mcpServers: { 'operator-canary': { command: 'true' } } })
        );

        // The pre-fix Agent HOME linked the host `.claude.json`, and the SDK default loaded
        // the 'project' source. Both reproduce their leak, so the fixture is meaningful.
        await symlink(join(hostHome, '.claude.json'), join(home, '.claude.json'));
        const before = await probe(sdk, { cwd: workspace, home });
        await prepareAgentHome({ agentRoot, home, hostHome });
        const after = await probe(sdk, {
            cwd: workspace,
            home,
            settingSources: [...CLAUDE_SETTING_SOURCES],
        });

        expect(before.memoryFiles).toEqual(
            expect.arrayContaining([join(parent, 'CLAUDE.md'), join(workspace, 'CLAUDE.md')])
        );
        expect(before.skills).toContain('ancestor-skill');
        expect(before.mcpServers).toContain('operator-canary');
        expect(after.memoryFiles).toEqual([]);
        expect(after.skills).toContain('probe-skill');
        expect(after.skills).not.toContain('ancestor-skill');
        expect(after.mcpServers).not.toContain('operator-canary');
    },
    300_000
);

/** Lets Computer's sandbox set up the Agent HOME exactly as a Claude launch does. */
async function prepareAgentHome(input: { agentRoot: string; home: string; hostHome: string }) {
    const runtime = makeDaemonRuntime();
    try {
        const session = await createLocalTrustedSandboxProvider({
            authProfiles: ['claude-code'],
            homeDir: input.home,
            hostHomeDir: input.hostHome,
            rootDir: input.agentRoot,
            runtime,
        }).createSession?.();
        await session?.destroy?.();
    } finally {
        await runtime.dispose();
    }
}

interface ClaudeSdk {
    query(input: { prompt: AsyncIterable<never>; options: Record<string, unknown> }): {
        close(): void;
        getContextUsage(): Promise<{ memoryFiles: { path: string }[] }>;
        mcpServerStatus(): Promise<{ name: string }[]>;
        supportedCommands(): Promise<{ name: string }[]>;
    };
}

async function probe(
    sdk: { module: ClaudeSdk; cli: string },
    input: { cwd: string; home: string; settingSources?: string[] }
) {
    const held = Promise.withResolvers<void>();
    // Streaming input that stays open without a user message, so no model request is made.
    const prompt: AsyncIterable<never> = {
        [Symbol.asyncIterator]: () => ({
            next: () => held.promise.then(() => ({ done: true, value: undefined as never })),
        }),
    };
    const q = sdk.module.query({
        options: {
            cwd: input.cwd,
            env: { ...process.env, HOME: input.home },
            pathToClaudeCodeExecutable: sdk.cli,
            skills: 'all',
            ...(input.settingSources ? { settingSources: input.settingSources } : {}),
        },
        prompt,
    });
    try {
        const usage = await q.getContextUsage();
        const commands = await q.supportedCommands();
        const servers = await q.mcpServerStatus();
        return {
            mcpServers: servers.map((server) => server.name),
            memoryFiles: usage.memoryFiles.map((file) => file.path),
            skills: commands.map((command) => command.name),
        };
    } finally {
        held.resolve();
        q.close();
    }
}

function skill(name: string): string {
    return `---\nname: ${name}\ndescription: Context isolation probe.\n---\nBody.\n`;
}

/** Runs the Computer's own Claude bridge bootstrap commands in `dir`. */
async function installBridgeSdk(dir: string) {
    const harness = createHarnessForRuntime(
        'claude-code',
        'medium',
        false,
        bridgeStoreDirForHost()
    );
    const bootstrap = await harness.getBootstrap?.();
    if (!bootstrap) {
        throw new Error('Missing Claude bridge bootstrap');
    }
    for (const file of bootstrap.files ?? []) {
        const path = join(dir, file.path);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, file.content);
    }
    const bootstrapDir = join(dir, bootstrap.bootstrapDir);
    for (const { command } of bootstrap.commands ?? []) {
        const proc = Bun.spawn(['sh', '-c', command], { cwd: bootstrapDir, stderr: 'inherit' });
        if ((await proc.exited) !== 0) {
            throw new Error(`Bridge bootstrap command failed: ${command}`);
        }
    }
    const module = (await import(
        join(bootstrapDir, 'node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs')
    )) as ClaudeSdk;
    return { cli: join(bootstrapDir, 'node_modules/.bin/claude'), module };
}
