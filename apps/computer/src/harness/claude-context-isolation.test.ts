import { afterAll, afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { ensureNativeSkillLinks } from './native-skill-links.ts';
import { createHarnessForRuntime } from './runtime-harness.ts';
import { createLocalTrustedSandboxProvider } from './sandbox.ts';

const roots: string[] = [];
const runtime = makeDaemonRuntime();

afterAll(() => runtime.dispose());
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

// Juniper and Beacon, 2026-10: the Agent SDK default loads the 'project' source, which walks
// every ancestor of the workspace and loaded the operator's own CLAUDE.md as Project memory.
// This drives Computer's real Claude harness and the shipped bridge, with a recording stand-in
// for the Agent SDK, to prove query() receives only the Agent HOME settings source.
test('the Claude bridge asks the Agent SDK for user settings and foreground sub-agents only, uncapped', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-claude-context-'));
    roots.push(root);
    const agentRoot = join(root, 'parent', 'servers', 'srv', 'agents', 'agt');
    const homeDir = join(agentRoot, 'home');
    const workspace = join(agentRoot, 'workspace');
    const skillsDir = join(agentRoot, 'skills');
    await mkdir(workspace, { recursive: true });
    await mkdir(skillsDir, { recursive: true });
    await ensureNativeSkillLinks(homeDir, skillsDir);
    await writeFile(join(root, 'parent', 'CLAUDE.md'), 'CANARY_ANCESTOR_CLAUDE_MD\n');

    const harness = createHarnessForRuntime('claude-code', 'medium');
    const recordPath = await installRecordingBridge(harness, join(homeDir, '.ai-sdk-harness'));
    const sandboxSession = await createLocalTrustedSandboxProvider({
        homeDir,
        hostHomeDir: join(root, 'host'),
        rootDir: agentRoot,
        runtime,
    }).createSession?.();
    if (!sandboxSession) {
        throw new Error('Sandbox provider did not create a session.');
    }
    const session = await harness.doStart({
        sandboxSession,
        sessionId: 'agt_context-isolation',
        sessionWorkDir: workspace,
    } as unknown as Parameters<typeof harness.doStart>[0]);
    try {
        const control = await session.doPromptTurn({
            emit: () => undefined,
            prompt: 'Start.',
            skills: [],
            tools: [],
        });
        await Promise.race([
            Promise.resolve(control.done).catch(() => undefined),
            Bun.sleep(15_000),
        ]);
        const options = JSON.parse(await readFile(recordPath, 'utf8'));
        expect(options.settingSources).toEqual(['user']);
        expect(options.backgroundTasksDisabled).toBe('1');
        expect(options.cwd).toBe(workspace);
        // Like Raft, no turn cap: hitting one ended real work as a retried `error_max_turns`.
        expect(options.hasMaxTurns).toBe(false);
        // Haus passes no skills, so the turn leaves no harness manifest in the linked library.
        expect(await readdir(skillsDir)).toEqual([]);
    } finally {
        await session.doDestroy?.();
        await sandboxSession.destroy?.();
    }
}, 30_000);

/**
 * Lays the shipped bridge into the harness state directory beside a stand-in Agent SDK that
 * records its query options. Returns the record path.
 */
async function installRecordingBridge(
    harness: ReturnType<typeof createHarnessForRuntime>,
    stateDir: string
): Promise<string> {
    const bootstrap = await harness.getBootstrap?.();
    const bridge = bootstrap?.files?.find((file) => file.path.endsWith('/bridge.mjs'));
    if (!(bootstrap && typeof bridge?.content === 'string')) {
        throw new Error('Missing shipped Claude bridge');
    }
    const bootstrapDir = join(stateDir, bootstrap.bootstrapDir);
    const modules = join(bootstrapDir, 'node_modules');
    const recordPath = join(bootstrapDir, 'query-options.json');
    await mkdir(join(modules, '@anthropic-ai', 'claude-agent-sdk'), { recursive: true });
    await mkdir(join(modules, '@modelcontextprotocol', 'sdk', 'server'), { recursive: true });
    await writeFile(join(bootstrapDir, 'bridge.mjs'), bridge.content);
    await writeFile(join(bootstrapDir, 'package.json'), '{"type":"module"}');
    await writeModule(join(modules, '@anthropic-ai', 'claude-agent-sdk'), sdkStandIn(recordPath));
    await writeFile(
        join(modules, '@modelcontextprotocol', 'sdk', 'server', 'mcp.js'),
        'export class McpServer {}\n'
    );
    await writeFile(
        join(modules, '@modelcontextprotocol', 'sdk', 'package.json'),
        '{"type":"module"}'
    );
    // The bridge's real runtime dependencies, resolved beside the Claude harness package.
    const adapterDir = dirname(Bun.resolveSync('@ai-sdk/harness-claude-code', import.meta.dir));
    for (const name of ['ws', 'zod']) {
        await symlink(
            dirname(Bun.resolveSync(`${name}/package.json`, adapterDir)),
            join(modules, name)
        );
    }
    return recordPath;
}

async function writeModule(dir: string, source: string): Promise<void> {
    await writeFile(join(dir, 'package.json'), '{"type":"module","main":"index.js"}');
    await writeFile(join(dir, 'index.js'), source);
}

function sdkStandIn(recordPath: string): string {
    return `import { writeFileSync } from 'node:fs';
export function query({ options }) {
    writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify({
        cwd: options.cwd,
        backgroundTasksDisabled: options.env?.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS,
        hasMaxTurns: 'maxTurns' in options,
        settingSources: options.settingSources,
    }));
    async function* messages() {
        yield { type: 'result', subtype: 'success', is_error: false, result: '', session_id: 'stand-in',
            total_cost_usd: 0, usage: { input_tokens: 0, output_tokens: 0 } };
    }
    const stream = messages();
    return Object.assign(stream, { interrupt: async () => {}, close: () => {} });
}
`;
}
