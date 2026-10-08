import { basename, dirname, join } from 'node:path';
import type { HarnessV1 } from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import type { ToolSet } from '@ai-sdk/provider-utils';
import type { HarnessTurnInput } from './executor.ts';
import { createLocalTrustedSandboxProvider } from './sandbox.ts';

/**
 * Grok spills MCP output past 20 KiB to a session file the Agent then spends a
 * turn reading back. Claude Code inlines roughly 100 KiB, so Grok gets the same.
 */
const GROK_MCP_OUTPUT_BYTES = 102_400;

/**
 * Grok reads Claude Code and Cursor instruction files (`.claude/CLAUDE.md`, `.claude/rules/`,
 * `~/.claude/`, and the Cursor equivalents) from HOME and every directory up to the git root.
 * Haus instructions arrive through `$GROK_HOME/AGENTS.md`, so those vendor sources stay off.
 * Grok 1.0.13 has no switch for generic `AGENTS.md`/`CLAUDE.md` in the workspace or its
 * git-root ancestors (docs/features/context-management.md records the gap).
 */
export const GROK_INSTRUCTION_COMPAT_ENV = {
    GROK_CLAUDE_AGENTS_ENABLED: 'false',
    GROK_CLAUDE_RULES_ENABLED: 'false',
    GROK_CURSOR_AGENTS_ENABLED: 'false',
    GROK_CURSOR_RULES_ENABLED: 'false',
} as const;

/**
 * Grok Build also scans Claude Code, Cursor, and Codex MCP config and fetches
 * xAI-managed MCP servers. Haus owns an Agent's MCP access, so launch closes
 * those sources; the environment outranks every config file the Agent can edit.
 */
const GROK_FOREIGN_MCP_SOURCES_OFF = {
    GROK_CLAUDE_MCPS_ENABLED: 'false',
    GROK_CODEX_MCPS_ENABLED: 'false',
    GROK_CURSOR_MCPS_ENABLED: 'false',
    GROK_MANAGED_MCPS_ENABLED: 'false',
} as const;

/**
 * Claude Code builtins Haus switches off. The first six match Raft's `CLAUDE_DISALLOWED_TOOLS`:
 * plan mode and the runtime's own wakeups and cron jobs, which Haus Reminders own.
 * `askUserQuestions` (native `AskUserQuestion`) waits on a host answer Haus never sends; Agents
 * ask humans in a Haus message instead. `Monitor` streams a background process, which cannot
 * outlive the turn (`CLAUDE_NO_BACKGROUND_TASKS_ENV`).
 */
export const CLAUDE_INACTIVE_TOOLS = [
    'EnterPlanMode',
    'ExitPlanMode',
    'ScheduleWakeup',
    'CronCreate',
    'CronList',
    'CronDelete',
    'askUserQuestions',
    'Monitor',
    'RemoteTrigger',
    'PushNotification',
] as const;

type AgentConstructionInput = Pick<
    HarnessTurnInput,
    'agentId' | 'env' | 'homeDir' | 'modelId' | 'runtime' | 'runtimeId' | 'tools' | 'workspaceDir'
>;

/**
 * The Agent's skills are deliberately not handed to the harness. Every runtime
 * reads its native skill directory, and `ensureNativeSkillLinks` already points
 * those at the one canonical library, so asking the harness to materialize its
 * own copies would write the library back over itself — which the harness now
 * refuses, since it only overwrites skill directories it owns. In-process Pi reads
 * the same link through the patched `@ai-sdk/harness-pi` skill loader.
 */
export function createHarnessAgent(
    input: AgentConstructionInput,
    options: { harness: HarnessV1<ToolSet>; instructions: string }
): HarnessAgent {
    return new HarnessAgent({
        harness: options.harness,
        id: input.agentId,
        ...inactiveToolSettings(input.runtimeId),
        instructions: options.instructions,
        model: input.modelId,
        permissionMode: 'allow-all',
        sandbox: createLocalTrustedSandboxProvider(sandboxOptions(input)),
        // Anchor at the parent so the workDir remains visible to workspace browsing.
        sandboxConfig: { workDir: basename(input.workspaceDir) },
        tools: input.tools,
    });
}

/** Builtins the runtime's harness must not offer; only Claude Code filters builtins. */
export function inactiveToolSettings(
    runtimeId: string
): { inactiveTools: string[] } | Record<string, never> {
    return runtimeId === 'claude-code' ? { inactiveTools: [...CLAUDE_INACTIVE_TOOLS] } : {};
}

export function sandboxOptions(
    input: AgentConstructionInput
): Parameters<typeof createLocalTrustedSandboxProvider>[0] {
    const rootDir = dirname(input.workspaceDir);
    const profile = authProfileFor(input.runtimeId);
    if (input.runtimeId === 'grok-build') {
        return {
            authProfiles: ['grok-build'] as const,
            env: {
                ...input.env,
                ...GROK_INSTRUCTION_COMPAT_ENV,
                ...GROK_FOREIGN_MCP_SOURCES_OFF,
                // Grok 1.0.13 `features.ask_user_question`: its question waits on a host answer
                // Haus never sends, so Agents ask humans in a Haus message instead.
                GROK_ASK_USER_QUESTION: 'false',
                GROK_HOME: join(input.homeDir, '.grok'),
                GROK_MAX_MCP_OUTPUT_BYTES: String(GROK_MCP_OUTPUT_BYTES),
                // Haus Agents run without sub-agents; Grok 1.0.13 then omits `spawn_subagent`.
                GROK_SUBAGENTS: '0',
                HOME: input.homeDir,
            },
            homeDir: input.homeDir,
            rootDir,
            runtime: input.runtime,
        };
    }
    if (input.runtimeId !== 'codex') {
        return {
            ...(profile ? { authProfiles: [profile] as const } : {}),
            env: { ...input.env, HOME: input.homeDir },
            homeDir: input.homeDir,
            rootDir,
            runtime: input.runtime,
        };
    }
    // Isolated CODEX_HOME reuses host login without leaking cross-Agent sessions.
    return {
        authProfiles: ['codex'] as const,
        env: {
            ...input.env,
            CODEX_HOME: join(input.homeDir, '.codex'),
            HOME: input.homeDir,
        },
        homeDir: input.homeDir,
        rootDir,
        runtime: input.runtime,
    };
}

function authProfileFor(runtimeId: string) {
    if (runtimeId === 'claude-code' || runtimeId === 'codex' || runtimeId === 'grok-build') {
        return runtimeId;
    }
    return null;
}
