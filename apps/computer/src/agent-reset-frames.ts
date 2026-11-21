import { join } from 'node:path';
import { agentConfigureCommandSchema } from '@haus/api';
import { parseResetCommand } from './agent-command-frames.ts';
import { applyResetGeneration } from './agent-reset-generation.ts';
import { resetAgentState } from './agent-reset.ts';
import { discardDrivePushes } from './drive/turn-sync.ts';

export interface AgentResetFrameContext {
    readonly agentsDir: string;
    readonly dataRoot: string;
    readonly report: () => Promise<unknown>;
    readonly resettingAgents: Set<string>;
    readonly retiredAgents: ReadonlySet<string>;
    readonly serverId: string;
    readonly track: (work: Promise<unknown>) => unknown;
}

export function handleAgentResetFrame(frame: unknown, context: AgentResetFrameContext) {
    const reset = resetOf(frame);
    if (!reset) {
        return false;
    }
    if (context.retiredAgents.has(reset.agentId)) {
        return true;
    }
    const agentRoot = join(context.agentsDir, reset.agentId);
    context.track(
        applyResetGeneration({
            agentRoot,
            clear: () => clearAgent(context, reset.agentId, agentRoot),
            generation: reset.generation,
            kind: reset.kind,
        })
            .then((outcome) => (outcome === 'cleared' ? context.report() : undefined))
            .catch((error: unknown) => {
                console.error(error instanceof Error ? error.message : error);
            })
    );
    return true;
}

async function clearAgent(context: AgentResetFrameContext, agentId: string, agentRoot: string) {
    context.resettingAgents.add(agentId);
    const resumePushes = discardDrivePushes(agentRoot);
    try {
        await resetAgentState({ agentId, dataRoot: context.dataRoot, serverId: context.serverId });
    } finally {
        context.resettingAgents.delete(agentId);
        resumePushes();
    }
}

function resetOf(frame: unknown) {
    const reset = parseResetCommand(frame);
    if (reset) {
        return { agentId: reset.agentId, generation: reset.sessionGeneration, kind: reset.kind };
    }
    const configure = agentConfigureCommandSchema.safeParse(frame);
    return configure.success
        ? {
              agentId: configure.data.agentId,
              generation: configure.data.sessionGeneration,
              kind: configure.data.sessionResetKind,
          }
        : null;
}
