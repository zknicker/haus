import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentReasoningEffort } from '@haus/api';
import type { HostToolMcpDescriptor } from '../../host-tools/mcp-server.ts';

/**
 * Claude Code builtins Haus switches off, as native names. The first six match Raft's
 * `CLAUDE_DISALLOWED_TOOLS`: plan mode and the runtime's own wakeups and cron jobs, which Haus
 * Reminders own. `AskUserQuestion` waits on a host answer Haus never sends. `Monitor` streams a
 * process's output into the conversation as it runs, a wake source Haus does not surface;
 * background sub-agents and shells stay on, as in Raft (specs/runtime-drivers.md).
 */
export const CLAUDE_DISALLOWED_TOOLS = [
    'EnterPlanMode',
    'ExitPlanMode',
    'ScheduleWakeup',
    'CronCreate',
    'CronList',
    'CronDelete',
    'AskUserQuestion',
    'Monitor',
    'RemoteTrigger',
    'PushNotification',
] as const;

/** Claude Code's native build drops Glob and Grep for the Agent and sub-agents unless named. */
export const CLAUDE_ALLOWED_TOOLS = ['Glob', 'Grep'] as const;

/** The env var the MCP config's Authorization header expands, so no file holds the token. */
export const HOST_TOOL_TOKEN_ENV = 'HAUS_HOST_TOOLS_TOKEN';

/** Everything that decides one `claude` process's launch. A change restarts a warm process. */
export interface ClaudeLaunch {
    readonly binaryPath: string;
    readonly mcpConfigPath: string;
    readonly modelId: string;
    readonly reasoningEffort: AgentReasoningEffort;
    /** `--resume`: the conversation the process continues. */
    readonly resumeSessionId?: string;
    /** `--session-id`: a fresh conversation's id, chosen before launch. */
    readonly sessionId?: string;
    readonly systemPromptPath: string;
}

/**
 * One long-lived stream-json process per Agent session (specs/runtime-drivers.md). Settings come
 * from the Agent HOME only; MCP is the Haus host-tool server alone; instructions ride a prompt
 * file, never argv.
 */
export function buildClaudeArgs(launch: ClaudeLaunch): string[] {
    const args = [
        '--output-format',
        'stream-json',
        '--input-format',
        'stream-json',
        '--include-partial-messages',
        '--verbose',
        '--model',
        launch.modelId,
        ...thinkingArgs(launch.modelId),
        ...(launch.reasoningEffort === 'default' ? [] : ['--effort', launch.reasoningEffort]),
        '--permission-mode',
        'bypassPermissions',
        '--allow-dangerously-skip-permissions',
        '--setting-sources',
        'user',
        '--allowedTools',
        CLAUDE_ALLOWED_TOOLS.join(','),
        '--disallowedTools',
        CLAUDE_DISALLOWED_TOOLS.join(','),
        '--mcp-config',
        launch.mcpConfigPath,
        '--strict-mcp-config',
        '--append-system-prompt-file',
        launch.systemPromptPath,
    ];
    if (launch.resumeSessionId) {
        args.push('--resume', launch.resumeSessionId);
    } else if (launch.sessionId) {
        args.push('--session-id', launch.sessionId);
    }
    return args;
}

/**
 * The harness default is adaptive thinking with summarized display; Haiku 4.5 runs extended
 * thinking enabled, which the CLI spells `--thinking adaptive` with no display override.
 */
function thinkingArgs(modelId: string): string[] {
    return modelId === 'claude-haiku-4-5'
        ? ['--thinking', 'adaptive']
        : ['--thinking', 'adaptive', '--thinking-display', 'summarized'];
}

/**
 * Sub-agents one Agent may run at once, foreground and background together. Claude Code
 * enforces it itself: an Agent call past the cap is refused with a tool error telling the model
 * not to retry (its default is 20).
 */
export const CLAUDE_MAX_CONCURRENT_SUBAGENTS = 4;

/** Variables the turn env must not carry into Claude Code. */
const droppedEnv = [
    // Marks a nested Claude Code session; the Agent's process is never nested (Raft).
    'CLAUDECODE',
    // Background work is part of the driver contract; an operator's shell must not switch it off.
    'CLAUDE_CODE_DISABLE_BACKGROUND_TASKS',
] as const;

/**
 * The process env: the Computer's own env, the turn's launch env (HOME is the Agent HOME), the
 * resolved provider credential, and the host-tool token the MCP config expands.
 */
export function buildClaudeEnv(input: {
    base: NodeJS.ProcessEnv;
    credentials: Readonly<Record<string, string>>;
    homeDir: string;
    hostToolToken: string;
    launchEnv: Readonly<Record<string, string>>;
}): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(input.base)) {
        if (value !== undefined) {
            env[key] = value;
        }
    }
    for (const key of droppedEnv) {
        delete env[key];
    }
    return {
        ...env,
        ...input.launchEnv,
        ...input.credentials,
        CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: String(CLAUDE_MAX_CONCURRENT_SUBAGENTS),
        // The Agent SDK's entrypoint: Claude Code shapes its built-in system prompt for a
        // programmatic host rather than an interactive terminal user. Without it, Agents read
        // sender prefixes like `@name:` as addressing someone else (placement-quick-fact eval).
        CLAUDE_CODE_ENTRYPOINT: 'sdk-ts',
        [HOST_TOOL_TOKEN_ENV]: input.hostToolToken,
        HOME: input.homeDir,
    };
}

/** The MCP config names only the Haus host-tool server; the bearer token stays in the env. */
export function renderClaudeMcpConfig(mcp: HostToolMcpDescriptor): string {
    return JSON.stringify({
        mcpServers: {
            [mcp.name]: {
                headers: { Authorization: `Bearer \${${HOST_TOOL_TOKEN_ENV}}` },
                type: mcp.transport,
                url: mcp.url,
            },
        },
    });
}

/** The bearer token the descriptor's Authorization header carries. */
export function hostToolToken(mcp: HostToolMcpDescriptor): string {
    const prefix = 'Bearer ';
    if (!mcp.headers.Authorization.startsWith(prefix)) {
        throw new Error('The host-tool MCP descriptor carries no bearer token.');
    }
    return mcp.headers.Authorization.slice(prefix.length);
}

/** Writes the launch files owner-only into `dir` and returns their paths. */
export async function writeClaudeLaunchFiles(input: {
    dir: string;
    instructions: string;
    mcpConfig: string;
}): Promise<{ mcpConfigPath: string; systemPromptPath: string }> {
    await mkdir(input.dir, { mode: 0o700, recursive: true });
    await chmod(input.dir, 0o700);
    const systemPromptPath = join(input.dir, 'claude-system-prompt.md');
    const mcpConfigPath = join(input.dir, 'claude-mcp.json');
    await writeOwnerOnly(systemPromptPath, input.instructions);
    await writeOwnerOnly(mcpConfigPath, input.mcpConfig);
    return { mcpConfigPath, systemPromptPath };
}

async function writeOwnerOnly(path: string, content: string) {
    await writeFile(path, content, { mode: 0o600 });
    // `mode` applies only on create; an existing file keeps its old bits otherwise.
    await chmod(path, 0o600);
}
