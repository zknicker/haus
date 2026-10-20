// Ported from botiverse/raft-source packages/daemon/src/drivers/claudeLaunch.test.ts (FSL-1.1-ALv2)
import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    buildClaudeArgs,
    buildClaudeEnv,
    CLAUDE_DISALLOWED_TOOLS,
    type ClaudeLaunch,
    HOST_TOOL_TOKEN_ENV,
    renderClaudeMcpConfig,
    writeClaudeLaunchFiles,
} from './claude-launch.ts';

const launch: ClaudeLaunch = {
    binaryPath: '/opt/claude',
    mcpConfigPath: '/agent/home/.haus-runtime/claude-code/claude-mcp.json',
    modelId: 'claude-sonnet-5-5',
    reasoningEffort: 'default',
    sessionId: '0618f17e-577e-4e6a-a7f0-31dc50611388',
    systemPromptPath: '/agent/home/.haus-runtime/claude-code/claude-system-prompt.md',
};
const value = (args: string[], flag: string) => args[args.indexOf(flag) + 1];
const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

test('claude launch config disallows provider-native cron tools, plan mode, and background tools', () => {
    expect(CLAUDE_DISALLOWED_TOOLS.slice(0, 6)).toEqual([
        'EnterPlanMode',
        'ExitPlanMode',
        'ScheduleWakeup',
        'CronCreate',
        'CronList',
        'CronDelete',
    ]);
    expect(CLAUDE_DISALLOWED_TOOLS).toContain('Monitor');
    expect(CLAUDE_DISALLOWED_TOOLS).toContain('AskUserQuestion');
    const args = buildClaudeArgs(launch);
    expect(value(args, '--disallowedTools')).toBe(CLAUDE_DISALLOWED_TOOLS.join(','));
    // The native build drops Glob and Grep unless the launch names them.
    expect(value(args, '--allowedTools')).toBe('Glob,Grep');
});

test('claude launch args pass the exact model and reasoning effort', () => {
    const args = buildClaudeArgs({ ...launch, reasoningEffort: 'high' });
    expect(value(args, '--model')).toBe('claude-sonnet-5-5');
    expect(value(args, '--effort')).toBe('high');
    expect(value(args, '--thinking')).toBe('adaptive');
    expect(value(args, '--thinking-display')).toBe('summarized');
});

test('claude launch args leave reasoning effort unset by default; Haiku thinks enabled', () => {
    expect(buildClaudeArgs(launch)).not.toContain('--effort');
    const haiku = buildClaudeArgs({ ...launch, modelId: 'claude-haiku-4-5' });
    expect(value(haiku, '--thinking')).toBe('adaptive');
    expect(haiku).not.toContain('--thinking-display');
});

test('claude launch resume passes the session id directly; a fresh launch fixes its id', () => {
    const resumed = buildClaudeArgs({
        ...launch,
        resumeSessionId: 'resume-me',
        sessionId: undefined,
    });
    expect(value(resumed, '--resume')).toBe('resume-me');
    expect(resumed).not.toContain('--session-id');
    expect(value(buildClaudeArgs(launch), '--session-id')).toBe(String(launch.sessionId));
});

test('claude launch args append standing instructions via prompt file only', () => {
    const args = buildClaudeArgs(launch);
    expect(value(args, '--append-system-prompt-file')).toBe(launch.systemPromptPath);
    expect(args).toContain('--include-partial-messages');
    for (const flag of ['--append-system-prompt', '--system-prompt-file', '--system-prompt']) {
        expect(args).not.toContain(flag);
    }
    expect(value(args, '--permission-mode')).toBe('bypassPermissions');
    expect(value(args, '--input-format')).toBe('stream-json');
    expect(value(args, '--output-format')).toBe('stream-json');
});

test('claude launch reads settings from the Agent HOME only and MCP from Haus only', () => {
    const args = buildClaudeArgs(launch);
    expect(value(args, '--setting-sources')).toBe('user');
    expect(value(args, '--mcp-config')).toBe(launch.mcpConfigPath);
    expect(args).toContain('--strict-mcp-config');
    const config = JSON.parse(
        renderClaudeMcpConfig({
            headers: { Authorization: 'Bearer secret-token' },
            name: 'haus',
            transport: 'http',
            url: 'http://127.0.0.1:4000/mcp',
        })
    );
    expect(config).toEqual({
        mcpServers: {
            haus: {
                // Claude Code expands the env var, so no file holds the token.
                headers: { Authorization: `Bearer \${${HOST_TOOL_TOKEN_ENV}}` },
                type: 'http',
                url: 'http://127.0.0.1:4000/mcp',
            },
        },
    });
});

test('claude env isolates HOME, drops the nested-session marker, and disables background work', () => {
    const env = buildClaudeEnv({
        base: { CLAUDECODE: '1', HOME: '/Users/operator', PATH: '/usr/bin' },
        credentials: { CLAUDE_CODE_OAUTH_TOKEN: 'token' },
        homeDir: '/agent/home',
        hostToolToken: 'host-token',
        launchEnv: { HAUS_AGENT_ID: 'agt_1', PATH: '/agent/bin:/usr/bin' },
    });
    expect(env).toEqual({
        CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1',
        CLAUDE_CODE_OAUTH_TOKEN: 'token',
        HAUS_AGENT_ID: 'agt_1',
        HAUS_HOST_TOOLS_TOKEN: 'host-token',
        HOME: '/agent/home',
        PATH: '/agent/bin:/usr/bin',
    });
});

test('claude system prompt and MCP config files are written owner-only (task #302)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'claude-mode-'));
    roots.push(root);
    const files = await writeClaudeLaunchFiles({
        dir: join(root, 'launch'),
        instructions: 'standing prompt body',
        mcpConfig: '{}',
    });
    for (const path of [files.systemPromptPath, files.mcpConfigPath]) {
        expect((await stat(path)).mode & 0o777).toBe(0o600);
    }
    expect((await stat(join(root, 'launch'))).mode & 0o777).toBe(0o700);
    expect(await readFile(files.systemPromptPath, 'utf8')).toBe('standing prompt body');
});
