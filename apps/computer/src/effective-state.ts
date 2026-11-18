import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { type AgentReasoningEffort, type HausAgentStatus, hausAgentVersion } from '@haus/api';
import { readAppliedAgentConfiguration } from './agent-configuration.ts';
import { readAgentSessionState } from './harness/session-store.ts';

export interface EffectiveAgentState {
    agentId: string;
    hausAgentAppliedAt: string | null;
    hausAgentStatus: HausAgentStatus;
    hausAgentVersion: string | null;
    missingResources: string[];
    modelId: string | null;
    reasoningEffort: AgentReasoningEffort | null;
    runtimeId: string | null;
}

/** Reconstructs the Computer-owned applied state from each durable Agent session. */
export async function readEffectiveAgentStates(
    dataRoot: string,
    serverId: string
): Promise<EffectiveAgentState[]> {
    const agentsRoot = join(dataRoot, 'servers', serverId, 'agents');
    let entries: Dirent[];
    try {
        entries = await readdir(agentsRoot, { withFileTypes: true });
    } catch (error) {
        if (isNodeCode(error, 'ENOENT')) {
            return [];
        }
        throw error;
    }
    return await Promise.all(
        entries
            .filter((entry) => entry.isDirectory())
            .sort((left, right) => left.name.localeCompare(right.name))
            .map(async (entry): Promise<EffectiveAgentState> => {
                const agentRoot = join(agentsRoot, entry.name);
                const [configuration, session] = await Promise.all([
                    readAppliedAgentConfiguration(agentRoot),
                    readAgentSessionState(agentRoot),
                ]);
                const versionState = effectiveHausAgentState(session);
                if (configuration) {
                    return {
                        agentId: entry.name,
                        ...versionState,
                        missingResources: configuration.missingResources,
                        modelId: configuration.modelId,
                        reasoningEffort: configuration.reasoningEffort,
                        runtimeId: configuration.runtimeId,
                    };
                }
                return session
                    ? {
                          agentId: entry.name,
                          ...versionState,
                          missingResources: [],
                          modelId: session.effectiveModel.modelId,
                          reasoningEffort: null,
                          runtimeId: session.effectiveModel.runtimeId,
                      }
                    : {
                          agentId: entry.name,
                          ...versionState,
                          missingResources: ['session'],
                          modelId: null,
                          reasoningEffort: null,
                          runtimeId: null,
                      };
            })
    );
}

function effectiveHausAgentState(session: Awaited<ReturnType<typeof readAgentSessionState>>) {
    const appliedVersion = session?.hausAgentVersion ?? null;
    const status: HausAgentStatus =
        appliedVersion === hausAgentVersion
            ? 'current'
            : session?.hausAgentStatus === 'failed'
              ? 'failed'
              : 'pending';
    return {
        hausAgentAppliedAt: session?.hausAgentAppliedAt ?? null,
        hausAgentStatus: status,
        hausAgentVersion: appliedVersion,
    };
}

function isNodeCode(error: unknown, code: string) {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === code
    );
}
