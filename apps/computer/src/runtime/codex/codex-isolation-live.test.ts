import { afterAll, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { startHostToolServer } from '../../host-tools/mcp-server.ts';
import { createCodexDriver } from './codex-driver.ts';
import { type CodexTransport, spawnCodexProcess } from './codex-transport.ts';
import { testWarmPool } from './testing/replay-driver.ts';

// Runs one small real Codex turn through the driver inside an Agent root seeded with canary
// AGENTS.md files and config-layer MCP servers, then reads what Codex recorded: the rollout's
// model input and the MCP servers it started. Nothing depends on the model's reply. The same
// launch with the isolation config stripped from `thread/start` must see the canaries, so the
// probe proves something.
//   HAUS_RUN_LIVE_CODEX_DRIVER_TEST=1 bun test apps/computer/src/runtime/codex/codex-isolation-live.test.ts
const liveTest = process.env.HAUS_RUN_LIVE_CODEX_DRIVER_TEST === '1' ? test : test.skip;
const server = startHostToolServer();
const roots: string[] = [];
afterAll(async () => {
    await server.stop();
    await Promise.all(roots.map((root) => rm(root, { force: true, recursive: true })));
});

const CANARIES = [
    'CANARY_HAUS_INSTRUCTIONS',
    'CANARY_HOST_HOME',
    'CANARY_PARENT_AGENTS',
    'CANARY_WORKSPACE_AGENTS',
];

liveTest(
    'a Codex driver session sees only Haus instructions and starts no config-layer MCP server',
    async () => {
        const [leaky, isolated] = await Promise.all([probe(stripIsolation), probe(null)]);
        expect(leaky.canaries).toEqual(
            expect.arrayContaining(['CANARY_PARENT_AGENTS', 'CANARY_WORKSPACE_AGENTS'])
        );
        expect(leaky.markers).toEqual(['agent_user', 'agent_project']);
        expect(leaky.mcpServers).toEqual(expect.arrayContaining(['agent_project', 'agent_user']));

        expect(isolated.canaries).toEqual(['CANARY_HAUS_INSTRUCTIONS']);
        expect(isolated.markers).toEqual([]);
        expect(isolated.mcpServers).toEqual([isolated.hostToolName]);
    },
    300_000
);

type Rewrite = (method: string, params: Record<string, unknown>) => void;

async function probe(rewrite: Rewrite | null) {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-codex-isolation-')));
    roots.push(root);
    const { home, workspace } = await seedCanaries(root);
    const mcpServers = new Set<string>();
    let hostToolName = '';
    const session = await createCodexDriver({
        env: {},
        warm: { key: home, pool: testWarmPool },
        homeDir: home,
        hostHomeDir: join(root, 'host'),
        hostToolServer: {
            openSession(tools) {
                const opened = server.openSession(tools);
                hostToolName = opened.mcp.name;
                return opened;
            },
        },
        instructions: 'Your Haus code word is CANARY_HAUS_INSTRUCTIONS.',
        modelId: process.env.HAUS_LIVE_CODEX_MODEL ?? 'gpt-5.6-luna',
        reasoningEffort: 'low',
        spawn: (launch) => observe(spawnCodexProcess(launch), rewrite, mcpServers),
        tools: [],
        workspaceDir: workspace,
    }).openSession({ resumeFrom: undefined, sessionId: 'isolation' });
    try {
        const turn = await session.startTurn({
            prompt: 'Reply with the single word OK. Do not use tools.',
            signal: AbortSignal.timeout(120_000),
        });
        for await (const _event of turn.events) {
            // Drain; the proof reads Codex's own record, not the reply.
        }
    } finally {
        await session.destroy();
    }
    const rollout = await rolloutText(join(home, '.codex'));
    return {
        canaries: CANARIES.filter((canary) => rollout.includes(canary)),
        hostToolName,
        markers: ['agent_user', 'agent_project'].filter((name) => existsSync(join(root, name))),
        mcpServers: [...mcpServers].sort(),
    };
}

async function seedCanaries(root: string) {
    const parent = join(root, 'parent');
    const home = join(parent, 'agents', 'agt', 'home');
    const workspace = join(parent, 'agents', 'agt', 'workspace');
    const host = join(root, 'host');
    await mkdir(join(workspace, '.codex'), { recursive: true });
    await mkdir(join(home, '.codex'), { recursive: true });
    await mkdir(join(host, '.codex'), { recursive: true });
    await Bun.spawn(['git', 'init', '-q', parent]).exited;
    await writeFile(join(parent, 'AGENTS.md'), 'CANARY_PARENT_AGENTS\n');
    await writeFile(join(workspace, 'AGENTS.md'), 'CANARY_WORKSPACE_AGENTS\n');
    await writeFile(join(host, '.codex', 'AGENTS.md'), 'CANARY_HOST_HOME\n');
    await symlink(join(homedir(), '.codex', 'auth.json'), join(host, '.codex', 'auth.json'));
    // What `codex mcp add` writes, in the Agent's own config and a workspace project layer.
    const markerServer = (name: string) =>
        `[mcp_servers.${name}]\ncommand = "/bin/sh"\nargs = ["-c", "touch '${join(root, name)}'; sleep 5"]\n`;
    await writeFile(join(home, '.codex', 'config.toml'), markerServer('agent_user'));
    await writeFile(join(workspace, '.codex', 'config.toml'), markerServer('agent_project'));
    return { home, workspace };
}

/** Records every MCP server Codex starts, and lets the control run rewrite outgoing requests. */
function observe(
    transport: CodexTransport,
    rewrite: Rewrite | null,
    mcpServers: Set<string>
): CodexTransport {
    transport.onLine((line) => {
        const message = JSON.parse(line) as { method?: string; params?: { name?: string } };
        if (message.method === 'mcpServer/startupStatus/updated' && message.params?.name) {
            mcpServers.add(message.params.name);
        }
    });
    return {
        ...transport,
        write(line) {
            if (!rewrite) {
                return transport.write(line);
            }
            const message = JSON.parse(line) as { method?: string; params?: unknown };
            if (message.method && isRecord(message.params)) {
                rewrite(message.method, message.params);
            }
            return transport.write(JSON.stringify(message));
        },
    };
}

/** The control: `thread/start` without the project-doc and config-layer MCP overrides. */
function stripIsolation(method: string, params: Record<string, unknown>) {
    if (method !== 'thread/start' || !isRecord(params.config)) {
        return;
    }
    const config = params.config;
    config.project_doc_max_bytes = undefined;
    if (isRecord(config.mcp_servers)) {
        config.mcp_servers = Object.fromEntries(
            Object.entries(config.mcp_servers).filter(
                ([, entry]) => isRecord(entry) && entry.enabled === true
            )
        );
    }
}

async function rolloutText(codexHome: string): Promise<string> {
    const paths = await Array.fromAsync(
        new Bun.Glob('sessions/**/rollout-*.jsonl').scan({ absolute: true, cwd: codexHome })
    );
    expect(paths).toHaveLength(1);
    return readFile(paths[0] as string, 'utf8');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
