import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
    type AgentConfigureCommand,
    type AgentReasoningEffort,
    agentConfigureCommandSchema,
    agentReasoningEffortSchema,
    type ComputerInventory,
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
    prepareWorkspace?: (agentRoot: string) => Promise<unknown>;
}): Promise<AppliedAgentConfiguration> {
    const agentRoot = join(
        input.dataRoot,
        'servers',
        input.serverId,
        'agents',
        input.command.agentId
    );
    await mkdir(agentRoot, { mode: 0o700, recursive: true });
    await Promise.all(
        ['home', 'runtime'].map((directory) =>
            mkdir(join(agentRoot, directory), { mode: 0o700, recursive: true })
        )
    );
    if (!(await prepareAgentWorkspace(input, agentRoot))) {
        // A plain workspace directory would be adopted as an uncapped legacy
        // workspace by the next apply.
        const unavailable: AppliedAgentConfiguration = {
            missingResources: ['workspace'],
            modelId: null,
            reasoningEffort: reasoningEffortFor(input.command),
            runtimeId: null,
        };
        await writeAppliedConfiguration(agentRoot, unavailable, input.command);
        return unavailable;
    }
    const applied = resolveConfiguration(input.command, input.inventory);
    await writeAppliedConfiguration(agentRoot, applied, input.command);
    return applied;
}

/**
 * A workspace the Computer cannot provide (no reserved capacity, a failed mount) is a missing
 * resource the report names, not a failed apply that leaves the Agent looking session-less.
 */
async function prepareAgentWorkspace(
    input: Parameters<typeof applyAgentConfiguration>[0],
    agentRoot: string
): Promise<boolean> {
    if (!input.prepareWorkspace) {
        await mkdir(join(agentRoot, 'workspace'), { mode: 0o700, recursive: true });
        return true;
    }
    try {
        await input.prepareWorkspace(agentRoot);
        return true;
    } catch (error) {
        console.error(
            `Agent ${input.command.agentId} workspace is unavailable: ${error instanceof Error ? error.message : error}`
        );
        return false;
    }
}

async function writeAppliedConfiguration(
    agentRoot: string,
    applied: AppliedAgentConfiguration,
    command: AgentConfigureCommand
) {
    const destination = join(agentRoot, 'configuration.json');
    const temporary = `${destination}.${process.pid}.tmp`;
    await writeFile(
        temporary,
        `${JSON.stringify({
            ...applied,
            seed: {
                agentDescription: command.agentDescription,
                agentName: command.agentName,
                brief: command.brief,
                briefAuthorHandle: command.briefAuthorHandle,
            },
        })}\n`,
        { mode: 0o600 }
    );
    await rename(temporary, destination);
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
              }
            : null;
    } catch {
        return null;
    }
}

export function resolveConfiguration(
    command: AgentConfigureCommand,
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

function reasoningEffortFor(command: AgentConfigureCommand) {
    return command.reasoningEffort;
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
