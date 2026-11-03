import { homedir } from 'node:os';
import type { HarnessTurnInput } from '../harness/executor.ts';
import { createClaudeCodeDriver } from './claude-code/claude-code-driver.ts';
import { createCodexDriver } from './codex/codex-driver.ts';
import type { RuntimeDriver, RuntimeDriverFactory, RuntimeDriverOptions } from './driver.ts';
import { createGrokDriver } from './grok/grok-driver.ts';
import { type RuntimeContext, requireRuntimeContext } from './runtime-context.ts';

/**
 * The production driver for a turn: its runtime's Haus driver, bound to the turn's launch facts
 * and the Computer-wide runtime context the attachment daemon opened.
 */
export const createRuntimeDriver: RuntimeDriverFactory<HarnessTurnInput> = (input, options) =>
    createDriver(input, options, requireRuntimeContext(input.runtime));

/** Maps a runtime id to its driver; an id without one is not executable here. */
export function createDriver(
    input: HarnessTurnInput,
    options: RuntimeDriverOptions,
    context: RuntimeContext
): RuntimeDriver {
    const shared = {
        env: options.env,
        homeDir: input.homeDir,
        hostToolServer: context.hostToolServer,
        instructions: options.instructions,
        modelId: input.modelId,
        processes: context.processes,
        reasoningEffort: input.reasoningEffort,
        tools: input.tools,
        // One Agent, one session: the Agent root keys its warm process. A throwaway
        // heartbeat session keys its own, so it never evicts the main one.
        warm: { key: options.throwawayKey ?? input.agentRoot, pool: context.warm },
        workspaceDir: input.workspaceDir,
    };
    switch (input.runtimeId) {
        case 'claude-code':
            // Only Claude Code runs background work past a turn (specs/runtime-drivers.md); a
            // throwaway session is destroyed with its turn, so it reports none.
            return createClaudeCodeDriver({
                ...shared,
                background: options.throwawayKey ? undefined : context.background,
            });
        case 'codex':
            return createCodexDriver({ ...shared, hostHomeDir: hostHome() });
        case 'grok-build':
            return createGrokDriver({ ...shared, hostHomeDir: hostHome() });
        default:
            throw new Error(`Unsupported runtime "${input.runtimeId}".`);
    }
}

/** The operator's HOME, whose native logins every Agent HOME links. */
function hostHome(): string {
    return process.env.HAUS_COMPUTER_HOST_HOME ?? process.env.HOME ?? homedir();
}
