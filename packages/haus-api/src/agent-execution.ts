import * as z from 'zod';

/** Human-selected reasoning policy for one Agent's desired execution config. */
export const agentReasoningEffortSchema = z.enum([
    'default',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
]);

export type AgentReasoningEffort = z.infer<typeof agentReasoningEffortSchema>;

export const agentReasoningEffortLabels: Record<AgentReasoningEffort, string> = {
    default: 'Not configurable',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    xhigh: 'Extra high',
    max: 'Max',
};

/** Older Computer inventories only support the original three-level contract. */
export function modelReasoningEfforts(model: { reasoningEfforts?: AgentReasoningEffort[] }) {
    return model.reasoningEfforts ?? (['low', 'medium', 'high'] satisfies AgentReasoningEffort[]);
}

export function modelDefaultReasoningEffort(model: {
    defaultReasoningEffort?: AgentReasoningEffort;
    reasoningEfforts?: AgentReasoningEffort[];
}): AgentReasoningEffort {
    const efforts = modelReasoningEfforts(model);
    return (
        model.defaultReasoningEffort ??
        (efforts.includes('medium') ? 'medium' : (efforts[0] ?? 'medium'))
    );
}

/** Grok's ACP adapter includes its effort launch argument in resume compatibility. */
export function reasoningChangeResetsSession(runtimeId: string): boolean {
    return runtimeId === 'grok-build';
}
