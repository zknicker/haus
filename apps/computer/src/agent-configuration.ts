import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { seedAgentWorkspace, seedFactoryManagedSkills } from '@haus/agent-workspace';
import {
    type AgentConfigureCommand,
    type AgentReasoningEffort,
    agentConfigureCommandSchema,
    agentReasoningEffortSchema,
    type ComputerInventory,
    type CoveApplyCommand,
} from '@haus/api';

export interface AppliedAgentConfiguration {
    missingResources: string[];
    modelId: string | null;
    reasoningEffort: AgentReasoningEffort;
    runtimeId: string | null;
}

export interface AgentSeedConfiguration {
    agentDescription: string | null;
    agentName: string;
    /** The standing brief the Server holds for this Agent, and whose it is. */
    brief: string | null;
    briefAuthorHandle: string | null;
    factoryKind: 'cove' | 'ordinary';
}
export function parseAgentConfigureCommand(frame: unknown): AgentConfigureCommand | null {
    const parsed = agentConfigureCommandSchema.safeParse(frame);
    return parsed.success ? parsed.data : null;
}
export async function applyAgentConfiguration(input: {
    command: AgentConfigureCommand;
    dataRoot: string;
    inventory: ComputerInventory;
    serverId: string;
}): Promise<AppliedAgentConfiguration> {
    const applied = resolveConfiguration(input.command, input.inventory);
    const agentRoot = join(
        input.dataRoot,
        'servers',
        input.serverId,
        'agents',
        input.command.agentId
    );
    await mkdir(agentRoot, { mode: 0o700, recursive: true });
    await Promise.all(
        ['home', 'runtime', 'skills', 'workspace'].map((directory) =>
            mkdir(join(agentRoot, directory), { mode: 0o700, recursive: true })
        )
    );
    await seedOrdinaryWorkspace(input.command, join(agentRoot, 'workspace'));
    await seedFactoryManagedSkills(join(agentRoot, 'skills'));
    const destination = join(agentRoot, 'configuration.json');
    const temporary = `${destination}.${process.pid}.tmp`;
    await writeFile(
        temporary,
        `${JSON.stringify({
            ...applied,
            seed: {
                agentDescription: input.command.agentDescription,
                agentName: input.command.agentName,
                brief: input.command.brief,
                briefAuthorHandle: input.command.briefAuthorHandle,
                factoryKind: input.command.factoryKind,
            },
        })}\n`,
        { mode: 0o600 }
    );
    await rename(temporary, destination);
    return applied;
}

export async function readAppliedAgentConfiguration(
    agentRoot: string
): Promise<AppliedAgentConfiguration | null> {
    try {
        const value = JSON.parse(
            await readFile(join(agentRoot, 'configuration.json'), 'utf8')
        ) as unknown;
        return isAppliedConfiguration(value)
            ? {
                  missingResources: value.missingResources,
                  modelId: value.modelId,
                  reasoningEffort: isReasoningEffort(value.reasoningEffort)
                      ? value.reasoningEffort
                      : 'medium',
                  runtimeId: value.runtimeId,
              }
            : null;
    } catch {
        return null;
    }
}
export async function readAgentSeedConfiguration(
    agentRoot: string
): Promise<AgentSeedConfiguration | null> {
    try {
        const value = JSON.parse(
            await readFile(join(agentRoot, 'configuration.json'), 'utf8')
        ) as unknown;
        return isRecord(value) && isAgentSeedConfiguration(value.seed)
            ? {
                  agentDescription: value.seed.agentDescription,
                  agentName: value.seed.agentName,
                  brief: value.seed.brief ?? null,
                  briefAuthorHandle: value.seed.briefAuthorHandle ?? null,
                  factoryKind: value.seed.factoryKind === 'cove' ? 'cove' : 'ordinary',
              }
            : null;
    } catch {
        return null;
    }
}

/**
 * The one place a Server-owned seed becomes workspace bytes, shared by the
 * configure path and by the full reset that re-seeds from the stored record.
 */
export async function seedOrdinaryWorkspace(
    seed: Pick<AgentSeedConfiguration, 'agentName' | 'brief' | 'briefAuthorHandle'> & {
        agentDescription: string | null;
    },
    workspaceDir: string
): Promise<void> {
    await seedAgentWorkspace({
        agentName: seed.agentName,
        bio: seed.agentDescription,
        brief: seed.brief,
        briefAuthorHandle: seed.briefAuthorHandle,
        workspaceDir,
    });
}

export function resolveConfiguration(
    command: AgentConfigureCommand | CoveApplyCommand,
    inventory: ComputerInventory
): AppliedAgentConfiguration {
    const runtime = inventory.runtimes.find((candidate) => candidate.id === command.runtimeId);
    if (!runtime) {
        return {
            missingResources: [`runtime:${command.runtimeId}`],
            modelId: null,
            reasoningEffort: reasoningEffortFor(command),
            runtimeId: null,
        };
    }
    if (!runtime.models.some((candidate) => candidate.id === command.modelId)) {
        return {
            missingResources: [`model:${command.modelId}`],
            modelId: null,
            reasoningEffort: reasoningEffortFor(command),
            runtimeId: runtime.id,
        };
    }
    return {
        missingResources: [],
        modelId: command.modelId,
        reasoningEffort: reasoningEffortFor(command),
        runtimeId: command.runtimeId,
    };
}

function reasoningEffortFor(
    command: AgentConfigureCommand | CoveApplyCommand
): AgentReasoningEffort {
    return 'reasoningEffort' in command ? command.reasoningEffort : 'medium';
}

function isAppliedConfiguration(value: unknown): value is AppliedAgentConfiguration {
    return (
        isRecord(value) &&
        Array.isArray(value.missingResources) &&
        value.missingResources.every((item) => typeof item === 'string') &&
        (typeof value.modelId === 'string' || value.modelId === null) &&
        (value.reasoningEffort === undefined || isReasoningEffort(value.reasoningEffort)) &&
        (typeof value.runtimeId === 'string' || value.runtimeId === null)
    );
}

function isReasoningEffort(value: unknown): value is AgentReasoningEffort {
    return agentReasoningEffortSchema.safeParse(value).success;
}

function isAgentSeedConfiguration(value: unknown): value is AgentSeedConfiguration {
    return (
        isRecord(value) &&
        typeof value.agentName === 'string' &&
        value.agentName.length > 0 &&
        value.agentName.length <= 80 &&
        (value.factoryKind === undefined ||
            value.factoryKind === 'cove' ||
            value.factoryKind === 'ordinary') &&
        (value.agentDescription === null ||
            (typeof value.agentDescription === 'string' &&
                value.agentDescription.length > 0 &&
                value.agentDescription.length <= 500)) &&
        isOptionalText(value.brief, 4000) &&
        isOptionalText(value.briefAuthorHandle, 64)
    );
}

/** A seeded field the Server may not have sent at all, or sent as null. */
function isOptionalText(value: unknown, maximum: number): boolean {
    return (
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.length > 0 && value.length <= maximum)
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
