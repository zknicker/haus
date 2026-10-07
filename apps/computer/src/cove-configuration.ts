import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { seedCoveWorkspace, validateCoveWorkspace } from '@haus/agent-workspace';
import {
    type ComputerInventory,
    type CoveApplyCommand,
    type CoveApplyResult,
    coveApplyCommandSchema,
} from '@haus/api';
import {
    readAgentSeedConfiguration,
    readAppliedAgentConfiguration,
    resolveConfiguration,
} from './agent-configuration.ts';
import { seedAgentManagedSkills } from './managed-skill-changes.ts';

/**
 * Cove's factory application: a replayable, receipt-guarded seed of the one
 * onboarding Agent's workspace. It is a different operation from ordinary Agent
 * configuration — idempotent by application id, validated byte-for-byte against
 * the factory manifest, and failing to a reported result rather than throwing.
 */

export function parseCoveApplyCommand(frame: unknown): CoveApplyCommand | null {
    const parsed = coveApplyCommandSchema.safeParse(frame);
    return parsed.success ? parsed.data : null;
}

export async function applyCoveConfiguration(input: {
    command: CoveApplyCommand;
    dataRoot: string;
    inventory: ComputerInventory;
    serverId: string;
}): Promise<CoveApplyResult> {
    const { command } = input;
    try {
        const applied = resolveConfiguration(command, input.inventory);
        if (applied.missingResources.length > 0) {
            throw new Error(
                `Cove configuration is unavailable: ${applied.missingResources.join(', ')}`
            );
        }
        const agentRoot = await ensureAgentRoot(input.dataRoot, input.serverId, command.agentId);
        const receiptPath = join(agentRoot, 'cove-application.json');
        await seedAgentManagedSkills(agentRoot);
        const existing = await readCoveReceipt(receiptPath);
        if (existing) {
            assertMatchingCoveReceipt(existing, command);
            const manifestSha256 = await validateCoveWorkspace(join(agentRoot, 'workspace'));
            if (manifestSha256 !== existing.manifestSha256) {
                throw new Error('Cove workspace no longer matches its durable factory receipt.');
            }
            await assertMatchingCoveConfiguration(agentRoot, command);
        } else {
            const manifestSha256 = await seedCoveWorkspace(join(agentRoot, 'workspace'));
            await writeJsonAtomic(join(agentRoot, 'configuration.json'), {
                ...applied,
                seed: {
                    agentDescription: command.agentDescription,
                    agentName: command.agentName,
                    brief: null,
                    briefAuthorHandle: null,
                    factoryKind: command.factoryKind,
                },
            });
            await writeJsonAtomic(receiptPath, {
                agentId: command.agentId,
                applicationId: command.applicationId,
                factoryKind: command.factoryKind,
                manifestSha256,
                modelId: command.modelId,
                runtimeId: command.runtimeId,
            });
        }
        return {
            agentId: command.agentId,
            applicationId: command.applicationId,
            factoryKind: 'cove',
            status: 'applied',
            type: 'cove-apply-result',
        };
    } catch (error) {
        return {
            agentId: command.agentId,
            applicationId: command.applicationId,
            error: safeCoveError(error),
            factoryKind: 'cove',
            status: 'failed',
            type: 'cove-apply-result',
        };
    }
}
async function assertMatchingCoveConfiguration(agentRoot: string, command: CoveApplyCommand) {
    const configuration = await readAppliedAgentConfiguration(agentRoot);
    const seed = await readAgentSeedConfiguration(agentRoot);
    if (
        configuration?.runtimeId !== command.runtimeId ||
        configuration.modelId !== command.modelId ||
        configuration.missingResources.length > 0 ||
        seed?.agentName !== command.agentName ||
        seed.agentDescription !== command.agentDescription
    ) {
        throw new Error('Cove configuration no longer matches its durable factory receipt.');
    }
}

interface CoveReceipt {
    agentId: string;
    applicationId: string;
    factoryKind: 'cove';
    manifestSha256: string;
    modelId: string;
    runtimeId: string;
}

async function ensureAgentRoot(dataRoot: string, serverId: string, agentId: string) {
    const agentRoot = join(dataRoot, 'servers', serverId, 'agents', agentId);
    await mkdir(agentRoot, { mode: 0o700, recursive: true });
    await Promise.all(
        ['home', 'runtime', 'skills', 'workspace'].map((directory) =>
            mkdir(join(agentRoot, directory), { mode: 0o700, recursive: true })
        )
    );
    return agentRoot;
}

async function writeJsonAtomic(destination: string, value: unknown) {
    const temporary = `${destination}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
    await rename(temporary, destination);
}

async function readCoveReceipt(path: string): Promise<CoveReceipt | null> {
    try {
        const value = JSON.parse(await readFile(path, 'utf8')) as CoveReceipt;
        if (value?.factoryKind !== 'cove') {
            throw new Error('The durable Cove factory receipt is invalid.');
        }
        return value;
    } catch (error) {
        if (isMissingFile(error)) {
            return null;
        }
        throw new Error('The durable Cove factory receipt is invalid.', { cause: error });
    }
}

function isMissingFile(error: unknown): boolean {
    return (
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
    );
}

function assertMatchingCoveReceipt(receipt: CoveReceipt, command: CoveApplyCommand) {
    if (
        receipt.agentId !== command.agentId ||
        receipt.applicationId !== command.applicationId ||
        receipt.runtimeId !== command.runtimeId ||
        receipt.modelId !== command.modelId
    ) {
        throw new Error('A conflicting Cove factory application is already durable.');
    }
}

function safeCoveError(error: unknown): string {
    const message = error instanceof Error ? error.message : 'Cove application failed.';
    return message.slice(0, 300);
}
