import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    type CodexLaunchFacts,
    codexMcpServers,
    codexProcessEnv,
    HOST_TOOL_TOKEN_ENV,
    prepareCodexHome,
} from './codex-launch.ts';
import { FakeAppServer } from './testing/fake-app-server.ts';
import { openFake } from './testing/session-harness.ts';

const hostTools = {
    headers: { Authorization: 'Bearer secret-token' },
    name: 'haus',
    transport: 'http',
    url: 'http://127.0.0.1:4000/mcp',
} as const;

const facts = (root: string): CodexLaunchFacts => ({
    env: { HAUS_AGENT_ID: 'agt_1', PATH: '/agent/bin' },
    homeDir: join(root, 'home'),
    hostHomeDir: join(root, 'host'),
    instructions: 'Haus instructions',
    modelId: 'gpt-5.6-luna',
    reasoningEffort: 'medium',
    workspaceDir: join(root, 'workspace'),
});

describe('Codex launch', () => {
    test('every config-layer MCP server is disabled; the host-tool server is the only one', () => {
        const servers = codexMcpServers(
            {
                config: { mcp_servers: { agent_user: { args: [], command: '/bin/sh' } } },
                layers: [
                    { config: { mcp_servers: { agent_project: { url: 'https://mcp.example' } } } },
                    { config: null },
                ],
            },
            hostTools
        );
        expect(servers).toEqual({
            agent_project: { enabled: false, url: 'http://127.0.0.1:9/' },
            agent_user: { command: 'false', enabled: false },
            haus: { bearer_token_env_var: HOST_TOOL_TOKEN_ENV, enabled: true, url: hostTools.url },
        });
        expect(JSON.stringify(servers)).not.toContain('secret-token');
    });

    test('a config layer declaring the host-tool name cannot replace it', () => {
        const servers = codexMcpServers(
            { config: { mcp_servers: { haus: { command: 'evil' } } }, layers: [] },
            hostTools
        );
        expect(servers.haus).toMatchObject({ enabled: true, url: hostTools.url });
    });

    test('an unexpected config/read shape fails loudly', () => {
        expect(() => codexMcpServers({ layers: 'nope' }, hostTools)).toThrow(/config\/read/u);
    });

    test('the app-server runs in the Agent HOME with an isolated CODEX_HOME and the token in env', () => {
        const root = '/r';
        const env = codexProcessEnv(facts(root), {
            hostToolToken: 'secret-token',
            managed: { CODEX_MANAGED_BY_PNPM: '1' },
        });
        expect(env).toMatchObject({
            CODEX_HOME: '/r/home/.codex',
            CODEX_MANAGED_BY_PNPM: '1',
            HAUS_AGENT_ID: 'agt_1',
            [HOST_TOOL_TOKEN_ENV]: 'secret-token',
            HOME: '/r/home',
            NO_BROWSER: '1',
            PATH: '/agent/bin',
        });
    });

    test('preparing the home links the operator Codex login into CODEX_HOME', async () => {
        const root = mkdtempSync(join(tmpdir(), 'haus-codex-launch-'));
        mkdirSync(join(root, 'host', '.codex'), { recursive: true });
        writeFileSync(join(root, 'host', '.codex', 'auth.json'), '{}');
        await prepareCodexHome(facts(root));
        expect(readlinkSync(join(root, 'home', '.codex', 'auth.json'))).toBe(
            join(root, 'host', '.codex', 'auth.json')
        );
    });

    test('the thread request disables project docs, apps, plugins, and sub-agents', async () => {
        const { fake } = await openFake(new FakeAppServer());
        expect(fake.request('config/read')?.params).toEqual({
            cwd: '<root>/workspace',
            includeLayers: true,
        });
        expect(fake.request('thread/start')?.params.config).toMatchObject({
            agents: { enabled: false },
            features: { apps: false, multi_agent: false, plugins: false },
            project_doc_max_bytes: 0,
            web_search: 'live',
        });
    });
});
