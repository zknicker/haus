import { afterAll, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { createHarnessAgent, GROK_INSTRUCTION_COMPAT_ENV, sandboxOptions } from './create-agent.ts';
import { createHarnessForRuntime } from './runtime-harness.ts';
import { createLocalTrustedSandboxProvider } from './sandbox.ts';

// Opt-in, no inference: under a placeholder XAI key the installed `grok` opens the Haus ACP
// session and records the instruction files it would inject in its session
// `prompt_context.json`; the turn itself then fails authentication.
// HAUS_RUN_LIVE_GROK_CONTEXT_TEST=1 bun test apps/computer/src/harness/grok-context-isolation.test.ts
const liveTest =
    process.env.HAUS_RUN_LIVE_GROK_CONTEXT_TEST === '1' && Bun.which('grok') ? test : test.skip;
const runtime = makeDaemonRuntime();
const roots: string[] = [];

afterAll(async () => {
    await Promise.all(roots.map((root) => rm(root, { force: true, recursive: true })));
    await runtime.dispose();
});

test('Grok Build launches with Claude and Cursor instruction sources off', () => {
    const env = sandboxOptions({
        agentId: 'agt_grok',
        env: {},
        homeDir: '/tmp/haus-grok/home',
        modelId: 'grok-4.6',
        runtime,
        runtimeId: 'grok-build',
        tools: {},
        workspaceDir: '/tmp/haus-grok/workspace',
    }).env;
    expect(env).toMatchObject(GROK_INSTRUCTION_COMPAT_ENV);
});

liveTest(
    'Grok loads no vendor-compat instruction files; generic names remain a known gap',
    async () => {
        const before = await probe(withoutCompatEnv);
        const after = await probe(createHarnessAgent);

        // The fixture reaches Grok, so the probe is meaningful.
        expect(before).toEqual(expect.arrayContaining(VENDOR_CANARIES));
        for (const canary of VENDOR_CANARIES) {
            expect(after).not.toContain(canary);
        }
        // Haus instructions still arrive through `$GROK_HOME/AGENTS.md`. Grok 1.0.13 has no
        // switch for generic names in the workspace and its git-root ancestors; when this
        // fails, Grok changed: adopt its switch and update context-management.md.
        expect(after.sort()).toEqual(['CANARY_HAUS_INSTRUCTIONS', ...GENERIC_CANARIES].sort());
    },
    120_000
);

// The shipped layout: `~/.haus/computer` is not inside a git repository.
liveTest(
    'without a git root above the workspace, Grok reads generic names from the workspace only',
    async () => {
        const after = await probe(createHarnessAgent, { gitRoot: false });

        expect(after.sort()).toEqual([
            'CANARY_HAUS_INSTRUCTIONS',
            'CANARY_WORKSPACE_AGENTS',
            'CANARY_WORKSPACE_CLAUDE',
        ]);
    },
    120_000
);

const VENDOR_CANARIES = ['CANARY_PARENT_DOT_CLAUDE', 'CANARY_PARENT_RULE', 'CANARY_HOME_CLAUDE'];
const GENERIC_CANARIES = [
    'CANARY_PARENT_AGENTS',
    'CANARY_PARENT_CLAUDE',
    'CANARY_WORKSPACE_AGENTS',
    'CANARY_WORKSPACE_CLAUDE',
];

type AgentInput = Parameters<typeof createHarnessAgent>[0];
type AgentOptions = Parameters<typeof createHarnessAgent>[1];

/** The shipped Grok construction with the compat env removed: the pre-fix control. */
function withoutCompatEnv(input: AgentInput, options: AgentOptions): HarnessAgent {
    const sandbox = sandboxOptions(input);
    const env = Object.fromEntries(
        Object.entries(sandbox.env ?? {}).filter(([key]) => !(key in GROK_INSTRUCTION_COMPAT_ENV))
    );
    return new HarnessAgent({
        harness: options.harness,
        instructions: options.instructions,
        model: input.modelId,
        permissionMode: 'allow-all',
        sandbox: createLocalTrustedSandboxProvider({ ...sandbox, env }),
        sandboxConfig: { workDir: 'workspace' },
    });
}

/** Opens a Haus Grok session in a fresh canary tree; returns the canaries Grok recorded. */
async function probe(
    build: (input: AgentInput, options: AgentOptions) => HarnessAgent,
    { gitRoot = true }: { gitRoot?: boolean } = {}
): Promise<string[]> {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-grok-context-')));
    roots.push(root);
    const parent = join(root, 'parent');
    const agentRoot = join(parent, 'agents', 'agt');
    const homeDir = join(agentRoot, 'home');
    const workspaceDir = join(agentRoot, 'workspace');
    await mkdir(join(parent, '.claude', 'rules'), { recursive: true });
    await mkdir(join(homeDir, '.claude'), { recursive: true });
    await mkdir(workspaceDir, { recursive: true });
    // A git root above the workspace makes Grok walk every directory down to it.
    if (gitRoot) {
        await Bun.spawn(['git', 'init', '-q', parent]).exited;
    }
    await writeFile(join(parent, 'AGENTS.md'), 'CANARY_PARENT_AGENTS\n');
    await writeFile(join(parent, 'CLAUDE.md'), 'CANARY_PARENT_CLAUDE\n');
    await writeFile(join(parent, '.claude', 'CLAUDE.md'), 'CANARY_PARENT_DOT_CLAUDE\n');
    await writeFile(join(parent, '.claude', 'rules', 'rule.md'), 'CANARY_PARENT_RULE\n');
    await writeFile(join(homeDir, '.claude', 'CLAUDE.md'), 'CANARY_HOME_CLAUDE\n');
    await writeFile(join(workspaceDir, 'AGENTS.md'), 'CANARY_WORKSPACE_AGENTS\n');
    await writeFile(join(workspaceDir, 'CLAUDE.md'), 'CANARY_WORKSPACE_CLAUDE\n');

    const input = {
        agentId: 'agt_grok_context',
        env: { XAI_API_KEY: 'xai-haus-placeholder' },
        homeDir,
        modelId: 'grok-4.6',
        runtime,
        runtimeId: 'grok-build',
        tools: {},
        workspaceDir,
    } satisfies AgentInput;
    const agent = build(input, {
        harness: createHarnessForRuntime('grok-build', 'default'),
        instructions: 'CANARY_HAUS_INSTRUCTIONS',
    });
    const session = await agent.createSession({ abortSignal: AbortSignal.timeout(60_000) });
    try {
        await agent
            .generate({ abortSignal: AbortSignal.timeout(60_000), prompt: 'Hi.', session })
            .catch(() => undefined);
    } finally {
        await session.destroy();
    }
    const contexts = await findFiles(join(homeDir, '.grok', 'sessions'), 'prompt_context.json');
    if (contexts.length === 0) {
        throw new Error('Grok recorded no session prompt context.');
    }
    const text = (await Promise.all(contexts.map((path) => readFile(path, 'utf8')))).join('\n');
    return [...new Set(text.match(/CANARY_[A-Z_]+/g) ?? [])];
}

async function findFiles(dir: string, name: string): Promise<string[]> {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => []);
    return entries
        .filter((entry) => entry.isFile() && entry.name === name)
        .map((entry) => join(entry.parentPath, entry.name));
}
