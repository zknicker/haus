import type { HarnessV1 } from '@ai-sdk/harness';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import { createGrokBuild } from '@ai-sdk/harness-grok-build';
import { createPi } from '@ai-sdk/harness-pi';
import type { ToolSet } from '@ai-sdk/provider-utils';
import type { AgentReasoningEffort } from '@haus/api';
import { withComputerBridgeBootstrap } from './bridge-bootstrap.ts';
import { createCodexAcp } from './codex-acp.ts';
import { withCodexAcpBootstrap } from './codex-acp-bootstrap.ts';

/**
 * Claude Code loads settings, skills, and memory only from the Agent's isolated HOME (its skill
 * links and login). The SDK default also loads 'project', which walks every workspace ancestor
 * for CLAUDE.md and `.claude/` and reached the operator's own home.
 */
export const CLAUDE_SETTING_SOURCES = ['user'] as const;

/**
 * Claude Code runs no background work. The harness bridge opens one query per turn and ends the
 * CLI at that turn's result, so a background shell, sub-agent, or monitor would die with the
 * turn and its completion notice would never arrive. The flag drops `run_in_background` from the
 * Agent and Bash tools and stops auto-backgrounding, so a timed-out foreground command stops
 * instead of detaching; `Monitor` is switched off separately (`CLAUDE_INACTIVE_TOOLS`).
 */
export const CLAUDE_NO_BACKGROUND_TASKS_ENV = {
    CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1',
} as const;

/**
 * Whether the runtime's harness lets the Agent start sub-agents, which turns on the prompt's
 * `## Working through sub-agents` section. Only Claude Code: Codex and Grok Build sub-agents are
 * switched off at their harness, and Pi has none.
 */
export function supportsSubagents(runtimeId: string): boolean {
    return runtimeId === 'claude-code';
}

/**
 * Applies the Agent's reasoning policy at the native runtime boundary. Every runtime here
 * steers a live turn (`submitUserMessage`), which the composed prompt promises: Claude Code
 * and Pi natively, Grok Build and Codex through Haus's @ai-sdk/harness-acp patch
 * (`_x.ai/interject` and `_session/steering`, gated in bridge-bootstrap.ts). A runtime
 * that cannot steer needs its own prompt variant before it joins this table.
 */
export function createHarnessForRuntime(
    runtimeId: string,
    reasoningEffort: AgentReasoningEffort,
    storeDir?: string,
    modelId?: string
): HarnessV1<ToolSet> {
    switch (runtimeId) {
        case 'claude-code':
            return withComputerBridgeBootstrap(
                createClaudeCode({
                    settingSources: [...CLAUDE_SETTING_SOURCES],
                    env: CLAUDE_NO_BACKGROUND_TASKS_ENV,
                    effort: reasoningEffort === 'default' ? undefined : reasoningEffort,
                    ...(modelId === 'claude-haiku-4-5'
                        ? { thinking: { type: 'enabled' as const } }
                        : {}),
                }),
                'claude-code',
                { storeDir }
            ) as HarnessV1<ToolSet>;
        case 'codex':
            return withCodexAcpBootstrap(
                createCodexAcp({
                    reasoningEffort: reasoningEffort === 'default' ? undefined : reasoningEffort,
                }),
                { storeDir }
            ) as HarnessV1<ToolSet>;
        case 'grok-build':
            return createGrokBuild({
                reasoningEffort: reasoningEffort === 'default' ? undefined : reasoningEffort,
            }) as HarnessV1<ToolSet>;
        case 'pi':
            return createPi({
                thinkingLevel: reasoningEffort === 'default' ? undefined : reasoningEffort,
            }) as HarnessV1<ToolSet>;
        default:
            throw new Error(`Unsupported runtime "${runtimeId}".`);
    }
}
