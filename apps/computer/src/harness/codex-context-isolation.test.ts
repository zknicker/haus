import { afterAll, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { bridgeStoreDirForHost } from './bridge-bootstrap.ts';
import { codexAcpEnvironment } from './codex-acp.ts';
import { sandboxOptions } from './create-agent.ts';
import { createHarnessForRuntime } from './runtime-harness.ts';
import { createLocalTrustedSandboxProvider } from './sandbox.ts';

// Opt-in. The first case installs the pinned Codex (network on a cold store) and renders its
// model-visible prompt with `codex debug prompt-input`: no model call. The second spends a
// small Codex turn to prove codex-acp carries the same config into a real Haus session.
// HAUS_RUN_LIVE_CODEX_CONTEXT_TEST=1 bun test apps/computer/src/harness/codex-context-isolation.test.ts
const liveTest = process.env.HAUS_RUN_LIVE_CODEX_CONTEXT_TEST === '1' ? test : test.skip;
const runtime = makeDaemonRuntime();
const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-codex-context-')));

afterAll(async () => {
    await rm(root, { force: true, recursive: true });
    await runtime.dispose();
});

const CANARIES = ['CANARY_HOST_HOME', 'CANARY_PARENT_AGENTS', 'CANARY_WORKSPACE_AGENTS'];

test('Codex launches with project docs off', () => {
    const config = JSON.parse(codexAcpEnvironment({ webSearch: false }).CODEX_CONFIG ?? '');
    expect(config.project_doc_max_bytes).toBe(0);
});

liveTest(
    'pinned Codex renders no AGENTS.md from the workspace, its git root, or the host home',
    async () => {
        const codex = await installPinnedCodex(join(root, 'bridge'));
        const tree = await canaryTree('prompt-input');
        const config = JSON.parse(codexAcpEnvironment({ webSearch: false }).CODEX_CONFIG ?? '');

        const before = await promptInput(codex, tree, {
            codexHome: join(tree.hostHome, '.codex'),
            config: {},
        });
        const after = await promptInput(codex, tree, {
            codexHome: join(tree.agentHome, '.codex'),
            config: { ...config, developer_instructions: 'CANARY_HAUS_INSTRUCTIONS' },
        });

        // Codex's own defaults load every canary, so the fixture is meaningful.
        expect(before).toEqual(expect.arrayContaining(CANARIES));
        expect(after).toEqual(['CANARY_HAUS_INSTRUCTIONS']);
    },
    300_000
);

liveTest(
    'a Haus Codex session sees its developer instructions and no ambient AGENTS.md',
    async () => {
        const tree = await canaryTree('session');
        // The stand-in host home carries the operator's real Codex login, as Haus links it.
        await symlink(
            join(homedir(), '.codex', 'auth.json'),
            join(tree.hostHome, '.codex', 'auth.json')
        );
        const input = {
            agentId: 'agt_codex_context',
            env: {},
            homeDir: tree.agentHome,
            modelId: process.env.HAUS_LIVE_CODEX_MODEL ?? 'gpt-5.6-luna',
            runtime,
            runtimeId: 'codex',
            tools: {},
            webAccess: null,
            workspaceDir: tree.workspace,
        } as const;
        const agent = new HarnessAgent({
            harness: createHarnessForRuntime('codex', 'default', false, bridgeStoreDirForHost()),
            instructions: 'Your Haus code word is CANARY_HAUS_INSTRUCTIONS.',
            model: input.modelId,
            permissionMode: 'allow-all',
            sandbox: createLocalTrustedSandboxProvider({
                ...sandboxOptions(input),
                hostHomeDir: tree.hostHome,
            }),
            sandboxConfig: { workDir: 'workspace' },
        });
        const session = await agent.createSession();
        try {
            const result = await agent.generate({
                abortSignal: AbortSignal.timeout(120_000),
                prompt: 'Do not use tools or read files. List every word beginning with CANARY_ that appears anywhere in your instructions or context so far, separated by spaces. If there are none, reply NONE.',
                session,
            });
            const seen = [...new Set(result.text.match(/CANARY_[A-Z_]+/g) ?? [])];
            expect(seen).toEqual(['CANARY_HAUS_INSTRUCTIONS']);
        } finally {
            await session.destroy();
        }
    },
    300_000
);

interface CanaryTree {
    agentHome: string;
    hostHome: string;
    workspace: string;
}

/** A git root above the Agent workspace, with AGENTS.md at every level and in the host home. */
async function canaryTree(name: string): Promise<CanaryTree> {
    const parent = join(root, name, 'parent');
    const agentHome = join(parent, 'agents', 'agt', 'home');
    const workspace = join(parent, 'agents', 'agt', 'workspace');
    const hostHome = join(root, name, 'host');
    await mkdir(workspace, { recursive: true });
    await mkdir(join(hostHome, '.codex'), { recursive: true });
    await mkdir(join(agentHome, '.codex'), { recursive: true });
    await Bun.spawn(['git', 'init', '-q', parent]).exited;
    await writeFile(join(parent, 'AGENTS.md'), 'CANARY_PARENT_AGENTS\n');
    await writeFile(join(workspace, 'AGENTS.md'), 'CANARY_WORKSPACE_AGENTS\n');
    await writeFile(join(hostHome, '.codex', 'AGENTS.md'), 'CANARY_HOST_HOME\n');
    return { agentHome, hostHome, workspace };
}

async function promptInput(
    codex: string,
    tree: CanaryTree,
    input: { codexHome: string; config: Record<string, unknown> }
): Promise<string[]> {
    // codex-acp applies CODEX_CONFIG as thread config overrides; `-c` is the CLI equivalent.
    const overrides = Object.entries(input.config).flatMap(([key, value]) => [
        '-c',
        `${key}=${JSON.stringify(value)}`,
    ]);
    const proc = Bun.spawn(
        [process.execPath, codex, 'debug', 'prompt-input', ...overrides, 'Hi.'],
        {
            cwd: tree.workspace,
            env: {
                CODEX_HOME: input.codexHome,
                HOME: dirname(input.codexHome),
                PATH: process.env.PATH ?? '',
            },
            stderr: 'pipe',
            stdout: 'pipe',
        }
    );
    const [exitCode, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ]);
    if (exitCode !== 0) {
        throw new Error(`codex debug prompt-input failed: ${stderr}`);
    }
    return [...new Set(stdout.match(/CANARY_[A-Z_]+/g) ?? [])];
}

/** Runs the Computer's own Codex bootstrap in `dir`; returns the pinned Codex CLI entry. */
async function installPinnedCodex(dir: string): Promise<string> {
    const harness = createHarnessForRuntime('codex', 'default', false, bridgeStoreDirForHost());
    const bootstrap = await harness.getBootstrap?.();
    if (!bootstrap) {
        throw new Error('Missing Codex bootstrap');
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
            throw new Error(`Codex bootstrap command failed: ${command}`);
        }
    }
    const acp = await realpath(
        join(bootstrapDir, 'implementation/node_modules/@agentclientprotocol/codex-acp')
    );
    return createRequire(join(acp, 'package.json')).resolve('@openai/codex/bin/codex.js');
}
