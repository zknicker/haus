import type { HarnessV1 } from '@ai-sdk/harness';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import { createCodex } from '@ai-sdk/harness-codex';
import { createGrokBuild } from '@ai-sdk/harness-grok-build';
import { createPi } from '@ai-sdk/harness-pi';
import type { ToolSet } from '@ai-sdk/provider-utils';
import type { AgentReasoningEffort } from '@haus/api';
import { withComputerBridgeBootstrap } from './bridge-bootstrap.ts';

/**
 * Whether a runtime's harness can steer a live turn (`submitUserMessage`), so a busy inbox
 * notice lands mid-turn and the composed prompt may promise it (Raft's
 * `supportsStdinNotification`). The harness signals this only per turn, after the prompt is
 * composed, so the list is kept here. Grok Build steers through Haus's @ai-sdk/harness-acp
 * patch (`_x.ai/interject`, gated in bridge-bootstrap.ts). Codex cannot: its adapter runs
 * `codex exec` with stdin closed, so its notices wait for the next turn.
 */
export function supportsMidTurnNotices(runtimeId: string): boolean {
    return runtimeId === 'claude-code' || runtimeId === 'grok-build' || runtimeId === 'pi';
}

/**
 * Applies the Agent's reasoning policy at the native runtime boundary.
 */
export function createHarnessForRuntime(
    runtimeId: string,
    reasoningEffort: AgentReasoningEffort,
    webAccess = false,
    storeDir?: string,
    modelId?: string
): HarnessV1<ToolSet> {
    switch (runtimeId) {
        case 'claude-code':
            return withComputerBridgeBootstrap(
                createClaudeCode({
                    // CLI-only output makes every send/check a tool call, so turns
                    // legitimately run long tool loops.
                    maxTurns: 50,
                    effort: reasoningEffort === 'default' ? undefined : reasoningEffort,
                    ...(modelId === 'claude-haiku-4-5'
                        ? { thinking: { type: 'enabled' as const } }
                        : {}),
                }),
                'claude-code',
                { storeDir }
            ) as HarnessV1<ToolSet>;
        case 'codex':
            return withComputerBridgeBootstrap(
                createCodex({
                    reasoningEffort: reasoningEffort === 'default' ? undefined : reasoningEffort,
                    ...(webAccess ? { webSearch: true } : {}),
                }),
                'codex',
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
