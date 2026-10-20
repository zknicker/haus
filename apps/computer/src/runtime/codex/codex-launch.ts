import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentReasoningEffort } from '@haus/api';
import type { HostToolMcpDescriptor } from '../../host-tools/mcp-server.ts';
import { referenceAuthProfiles } from '../auth-profiles.ts';
import { configReadResultSchema } from './protocol.ts';

/** The env var the host-tool bearer token rides in, so it never appears on argv or in config. */
export const HOST_TOOL_TOKEN_ENV = 'HAUS_HOST_TOOL_TOKEN';

/** Launch facts one Agent's Codex session runs with. */
export interface CodexLaunchFacts {
    readonly env: Record<string, string>;
    /** The Agent's isolated HOME; Codex state lives in `<homeDir>/.codex`. */
    readonly homeDir: string;
    /** The operator's HOME, whose Codex login the Agent HOME links. */
    readonly hostHomeDir?: string;
    readonly instructions: string;
    readonly modelId: string;
    readonly reasoningEffort: AgentReasoningEffort;
    readonly workspaceDir: string;
}

export function codexHomeFor(homeDir: string): string {
    return join(homeDir, '.codex');
}

/**
 * Isolated CODEX_HOME under the Agent HOME, with the operator's `auth.json` linked in. Skills
 * resolve natively from `$HOME/.agents/skills`, which Computer links at launch.
 */
export async function prepareCodexHome(facts: CodexLaunchFacts): Promise<void> {
    await mkdir(codexHomeFor(facts.homeDir), { mode: 0o700, recursive: true });
    const hostHomeDir = facts.hostHomeDir ?? homedir();
    await referenceAuthProfiles({
        authProfiles: ['codex'],
        homeDir: facts.homeDir,
        hostGrokHomeDir: join(hostHomeDir, '.grok'),
        hostHomeDir,
    });
}

/** The app-server's environment: the turn's env, the Agent HOME, and Codex's own switches. */
export function codexProcessEnv(
    facts: CodexLaunchFacts,
    extra: { hostToolToken: string; managed: Record<string, string> }
): Record<string, string> {
    return {
        ...inheritedEnv(),
        ...facts.env,
        ...extra.managed,
        CODEX_HOME: codexHomeFor(facts.homeDir),
        [HOST_TOOL_TOKEN_ENV]: extra.hostToolToken,
        HOME: facts.homeDir,
        NO_BROWSER: '1',
    };
}

/**
 * Thread config every `thread/start` and `thread/resume` carries, as codex-acp's `CODEX_CONFIG`
 * did: no project docs (Haus instructions ride `developerInstructions`), no ChatGPT apps or
 * plugin MCP servers, no sub-agents, live web search, and the reasoning effort.
 */
export function codexThreadConfig(
    facts: CodexLaunchFacts,
    mcpServers: Record<string, unknown>
): Record<string, unknown> {
    return {
        ...(facts.reasoningEffort === 'default'
            ? {}
            : { model_reasoning_effort: facts.reasoningEffort }),
        agents: { enabled: false },
        features: { apps: false, multi_agent: false, plugins: false },
        mcp_servers: mcpServers,
        project_doc_max_bytes: 0,
        web_search: 'live',
    };
}

/** The shared fields of a fresh or resumed thread request. */
export function codexThreadParams(
    facts: CodexLaunchFacts,
    mcpServers: Record<string, unknown>
): Record<string, unknown> {
    return {
        approvalPolicy: 'never',
        config: codexThreadConfig(facts, mcpServers),
        cwd: facts.workspaceDir,
        developerInstructions: facts.instructions,
        model: facts.modelId,
        sandbox: 'danger-full-access',
    };
}

/**
 * The thread's MCP servers: the Haus host-tool server alone. Every server a config layer
 * declares (the Agent's `config.toml`, a workspace `.codex/config.toml`) is overridden by an
 * inert, disabled entry; thread config merges per name, so each override stays valid alone.
 */
export function codexMcpServers(
    configRead: unknown,
    hostTools: HostToolMcpDescriptor
): Record<string, unknown> {
    const servers: Record<string, unknown> = {};
    for (const [name, server] of declaredMcpServers(configRead)) {
        servers[name] ??=
            isRecord(server) && 'url' in server
                ? { enabled: false, url: 'http://127.0.0.1:9/' }
                : { command: 'false', enabled: false };
    }
    servers[hostTools.name] = {
        bearer_token_env_var: HOST_TOOL_TOKEN_ENV,
        enabled: true,
        url: hostTools.url,
    };
    return servers;
}

function declaredMcpServers(configRead: unknown): [string, unknown][] {
    const parsed = configReadResultSchema.safeParse(configRead);
    if (!parsed.success) {
        throw new Error(`Codex config/read returned an unexpected shape: ${parsed.error.message}`);
    }
    const layers = [
        parsed.data.config,
        ...(parsed.data.layers ?? []).map((layer) =>
            isRecord(layer.config) ? layer.config : null
        ),
    ];
    return layers.flatMap((config) =>
        isRecord(config?.mcp_servers) ? Object.entries(config.mcp_servers) : []
    );
}

/** The Computer's own env, minus values that point Codex at the operator's own state. */
function inheritedEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined && key !== 'CODEX_HOME' && !key.startsWith('CODEX_MANAGED_')) {
            env[key] = value;
        }
    }
    return env;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
