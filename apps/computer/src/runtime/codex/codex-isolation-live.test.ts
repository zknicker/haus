import { afterAll, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { startHostToolServer } from '../../host-tools/mcp-server.ts';
import { createCodexDriver } from './codex-driver.ts';

// Opt-in: one small real Codex turn.
// HAUS_RUN_LIVE_CODEX_DRIVER_TEST=1 bun test apps/computer/src/runtime/codex/codex-isolation-live.test.ts
const liveTest = process.env.HAUS_RUN_LIVE_CODEX_DRIVER_TEST === '1' ? test : test.skip;
const server = startHostToolServer();
afterAll(() => server.stop());

liveTest(
    'a Codex driver session sees only Haus instructions and starts no config-layer MCP server',
    async () => {
        const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-codex-isolation-')));
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
        const session = await createCodexDriver({
            env: {},
            homeDir: home,
            hostHomeDir: host,
            hostToolServer: server,
            instructions: 'Your Haus code word is CANARY_HAUS_INSTRUCTIONS.',
            modelId: process.env.HAUS_LIVE_CODEX_MODEL ?? 'gpt-5.6-luna',
            reasoningEffort: 'low',
            tools: [],
            workspaceDir: workspace,
        }).openSession({ resumeFrom: undefined, sessionId: 'isolation' });
        try {
            const turn = await session.startTurn({
                prompt: 'Do not use tools or read files. List every word beginning with CANARY_ that appears anywhere in your instructions or context so far, separated by spaces. If there are none, reply NONE.',
                signal: AbortSignal.timeout(120_000),
            });
            let text = '';
            for await (const event of turn.events) {
                if (event.type === 'text-delta') {
                    text += event.text;
                }
            }
            expect([...new Set(text.match(/CANARY_[A-Z_]+/gu) ?? [])]).toEqual([
                'CANARY_HAUS_INSTRUCTIONS',
            ]);
            expect(existsSync(join(root, 'agent_user'))).toBe(false);
            expect(existsSync(join(root, 'agent_project'))).toBe(false);
        } finally {
            await session.destroy();
            await rm(root, { force: true, recursive: true });
        }
    },
    300_000
);
