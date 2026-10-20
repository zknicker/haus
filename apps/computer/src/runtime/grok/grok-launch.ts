import { createHash } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import type { AgentReasoningEffort } from '@haus/api';
import { referenceAuthProfiles } from '../../harness/sandbox-auth-profiles.ts';

/**
 * Grok reads Claude Code and Cursor instruction files (`.claude/CLAUDE.md`, `.claude/rules/`,
 * `~/.claude/`, and the Cursor equivalents) from HOME and every directory up to the git root.
 * Haus instructions arrive through `$GROK_HOME/AGENTS.md`, so those vendor sources stay off.
 * Grok 1.0.13 has no switch for generic `AGENTS.md`/`CLAUDE.md` in the workspace or its git-root
 * ancestors (docs/features/context-management.md records the gap).
 */
export const GROK_INSTRUCTION_COMPAT_ENV = {
    GROK_CLAUDE_AGENTS_ENABLED: 'false',
    GROK_CLAUDE_RULES_ENABLED: 'false',
    GROK_CURSOR_AGENTS_ENABLED: 'false',
    GROK_CURSOR_RULES_ENABLED: 'false',
} as const;

/**
 * Haus owns an Agent's MCP access: Grok's scans of Claude Code, Cursor, and Codex MCP config and
 * its xAI-managed servers stay closed. The environment outranks any config file the Agent edits.
 */
export const GROK_FOREIGN_MCP_SOURCES_OFF = {
    GROK_CLAUDE_MCPS_ENABLED: 'false',
    GROK_CODEX_MCPS_ENABLED: 'false',
    GROK_CURSOR_MCPS_ENABLED: 'false',
    GROK_MANAGED_MCPS_ENABLED: 'false',
} as const;

/**
 * Grok spills MCP output past 20 KiB to a session file the Agent then spends a turn reading back;
 * Claude Code inlines roughly 100 KiB, so Grok gets the same.
 */
const GROK_MCP_OUTPUT_BYTES = 102_400;

export const GROK_ISOLATION_ENV = {
    ...GROK_INSTRUCTION_COMPAT_ENV,
    ...GROK_FOREIGN_MCP_SOURCES_OFF,
    // A native question waits on a host answer Haus never sends; Agents ask in a Haus message.
    GROK_ASK_USER_QUESTION: 'false',
    GROK_MAX_MCP_OUTPUT_BYTES: String(GROK_MCP_OUTPUT_BYTES),
    // Haus Agents run without sub-agents; Grok then omits `spawn_subagent`.
    GROK_SUBAGENTS: '0',
    NO_COLOR: '1',
} as const;

/**
 * `--always-approve` is the launch half of auto-approval; the session half is `yoloMode` in the
 * session `_meta`. `--no-leader` keeps each Agent in its own process, never a shared leader.
 */
export function grokLaunchArgs(reasoningEffort: AgentReasoningEffort): string[] {
    return [
        'agent',
        '--no-leader',
        '--always-approve',
        ...(reasoningEffort === 'default' ? [] : ['--reasoning-effort', reasoningEffort]),
        'stdio',
    ];
}

export function grokSessionMeta(): { yoloMode: true } {
    return { yoloMode: true };
}

/** Permission requests auto-approve only with both launch and session yolo facts (Raft). */
export function grokLaunchAllowsAutoApproval(
    args: readonly string[],
    sessionMeta: Readonly<Record<string, unknown>>
): boolean {
    return args.includes('--always-approve') && sessionMeta.yoloMode === true;
}

export function grokHome(homeDir: string): string {
    return join(homeDir, '.grok');
}

/** The child env: the host env, the turn's launch env, then the isolation Haus requires. */
export function grokLaunchEnv(input: {
    credentialEnv: Readonly<Record<string, string>>;
    env: Readonly<Record<string, string>>;
    homeDir: string;
}): Record<string, string> {
    const inherited = Object.fromEntries(
        Object.entries(process.env).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string'
        )
    );
    return {
        ...inherited,
        ...input.env,
        ...GROK_ISOLATION_ENV,
        ...input.credentialEnv,
        GROK_HOME: grokHome(input.homeDir),
        HOME: input.homeDir,
    };
}

/** Links the operator's Grok login into the Agent HOME and installs the Haus instructions. */
export async function prepareGrokHome(input: {
    homeDir: string;
    hostGrokHomeDir?: string;
    hostHomeDir?: string;
    instructions: string;
}): Promise<void> {
    const hostHomeDir =
        input.hostHomeDir ??
        process.env.HAUS_COMPUTER_HOST_HOME ??
        process.env.HOME ??
        os.homedir();
    const home = grokHome(input.homeDir);
    await mkdir(home, { mode: 0o700, recursive: true });
    await referenceAuthProfiles({
        authProfiles: ['grok-build'],
        homeDir: input.homeDir,
        hostGrokHomeDir:
            input.hostGrokHomeDir ?? process.env.GROK_HOME ?? join(hostHomeDir, '.grok'),
        hostHomeDir,
    });
    const target = join(home, 'AGENTS.md');
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, input.instructions, { mode: 0o600 });
    await rename(temporary, target);
}

/**
 * Launch facts a warm process must share with a new open to be reused for it. `env` is the turn's
 * launch env, never the resolved credential, so a refreshed token does not force a relaunch.
 */
export function grokLaunchFingerprint(facts: {
    args: readonly string[];
    command: readonly string[];
    cwd: string;
    env: Readonly<Record<string, string>>;
    homeDir: string;
    instructions: string;
}): string {
    return createHash('sha256').update(JSON.stringify(facts)).digest('hex');
}
