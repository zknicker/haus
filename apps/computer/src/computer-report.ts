import type { AgentEffectiveState } from '@haus/api';
import { readDefaultCloudAgentProvider } from './cloud-agents/settings.ts';
import { type EffectiveAgentState, readEffectiveAgentStates } from './effective-state.ts';
import {
    listAgentSkillImportReports,
    listAgentSkillReports,
    listImportableSkills,
} from './host-skills.ts';
import { detectFullInventory } from './inventory.ts';
import { refreshRuntimeAuthentication } from './runtime-auth-refresh.ts';
import { readRuntimeIssues } from './runtime-issues.ts';
import { loginKeychain } from './secrets/keychain.ts';
import { readSecretsStatus } from './secrets/store.ts';

export function createComputerReporter(dataRoot: string) {
    return async (
        send: (frame: unknown) => boolean,
        serverId: string,
        computerName: string,
        recheckAuthentication = false
    ) => {
        if (recheckAuthentication) {
            await refreshRuntimeAuthentication({ dataRoot });
        }
        await sendEffectiveComputerReport({ send, serverId, computerName, dataRoot });
    };
}

export async function sendEffectiveComputerReport({
    send,
    serverId,
    computerName,
    dataRoot,
}: {
    send(frame: unknown): boolean;
    serverId: string;
    computerName: string;
    dataRoot: string;
}) {
    const agents = await readEffectiveAgentStates(dataRoot, serverId);
    send({
        agents: agents.map(toReportedAgentState),
        inventory: {
            ...(await detectFullInventory({
                defaultCloudAgentProvider: await readDefaultCloudAgentProvider(dataRoot),
            })),
            runtimeIssues: await readRuntimeIssues(dataRoot),
            agentSkillImports: await listAgentSkillImportReports(dataRoot, serverId),
            agentSkills: await listAgentSkillReports(dataRoot, serverId),
            importableSkills: await listImportableSkills(),
            name: computerName,
            // An unreadable secrets state must not cost the whole report.
            secrets: await readSecretsStatus({
                dataRoot,
                keychain: loginKeychain(),
                serverId,
            }).catch(reportStateError),
        },
        type: 'report',
    });
    send({
        agents: agents.map(
            ({ agentId, hausAgentAppliedAt, hausAgentStatus, hausAgentVersion }) => ({
                agentId,
                appliedAt: hausAgentAppliedAt,
                status: hausAgentStatus,
                version: hausAgentVersion,
            })
        ),
        type: 'haus-agent-report',
    });
}

export function toReportedAgentState({
    agentId,
    missingResources,
    modelId,
    reasoningEffort,
    runtimeId,
}: EffectiveAgentState): AgentEffectiveState {
    return { agentId, missingResources, modelId, reasoningEffort, runtimeId };
}

export function reportStateError(error: unknown) {
    console.error(
        `Computer state report failed: ${error instanceof Error ? error.message : error}`
    );
}
