import * as z from 'zod';

import { agentRuntimeModelProviderIdSchema } from './model-providers.ts';

export const agentRuntimeModelProviderSchema = agentRuntimeModelProviderIdSchema;
export const agentRuntimeModelIdSchema = z.string().trim().min(1);

export const agentRuntimeModelIdentitySchema = z.object({
    modelId: agentRuntimeModelIdSchema,
    provider: agentRuntimeModelProviderSchema,
});

export type AgentRuntimeModelIdentity = z.infer<typeof agentRuntimeModelIdentitySchema>;

export function formatAgentRuntimeModelRef(model: AgentRuntimeModelIdentity): string {
    return `${model.provider}/${model.modelId}`;
}

export function parseAgentRuntimeModelRef(value: string): AgentRuntimeModelIdentity {
    const trimmed = value.trim();
    const separatorIndex = trimmed.indexOf('/');

    if (separatorIndex < 1 || separatorIndex === trimmed.length - 1) {
        throw new Error(`Invalid model ref "${value}". Expected "<provider>/<modelId>".`);
    }

    return agentRuntimeModelIdentitySchema.parse({
        modelId: trimmed.slice(separatorIndex + 1),
        provider: trimmed.slice(0, separatorIndex),
    });
}

export function normalizeAgentRuntimeModelIdentity(
    value: null | AgentRuntimeModelIdentity | undefined
): AgentRuntimeModelIdentity | null {
    if (!value) {
        return null;
    }

    return agentRuntimeModelIdentitySchema.parse(value);
}

export function sameAgentRuntimeModelIdentity(
    left: null | AgentRuntimeModelIdentity | undefined,
    right: null | AgentRuntimeModelIdentity | undefined
): boolean {
    if (!(left && right)) {
        return left == null && right == null;
    }

    return left.provider === right.provider && left.modelId === right.modelId;
}
