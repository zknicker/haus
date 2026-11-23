import {
    parseAgentRetireCommand,
    purgeRetiredAgent,
    reportRetirementError,
} from './agent-retirement.ts';

export interface AgentRetireFrameContext {
    readonly dataRoot: string;
    readonly fence: (agentId: string) => Promise<void>;
    readonly onFailure: (error: unknown) => void;
    readonly report: () => Promise<unknown>;
    readonly retiredAgents: Set<string>;
    readonly serverId: string;
    readonly track: (work: Promise<unknown>) => unknown;
}

export function handleAgentRetireFrame(frame: unknown, context: AgentRetireFrameContext) {
    const retirement = parseAgentRetireCommand(frame);
    if (!retirement) {
        return false;
    }
    const { agentId } = retirement;
    context.retiredAgents.add(agentId);
    context.track(
        context
            .fence(agentId)
            .then(() =>
                purgeRetiredAgent({
                    agentId,
                    dataRoot: context.dataRoot,
                    serverId: context.serverId,
                })
            )
            .catch((error: unknown) => reportRetirementError(agentId, error))
            .then(() => context.report())
            .catch(context.onFailure)
    );
    return true;
}
