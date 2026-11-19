import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { coveOnboardingFaq } from './cove-factory-faq.ts';
import { recognizedFactoryGuidanceHashes } from './cove-factory-guidance-hashes.ts';
import { coveMemory, coveOnboardingPlaybook } from './cove-factory-guidance.ts';
import { refreshCoveGuidanceFile } from './cove-guidance-file-refresh.ts';
import { renderCoveObjectives } from './cove-objectives.ts';

export { coveSeededSummaries } from './cove-objectives.ts';

const coveFiles = {
    'MEMORY.md': coveMemory,
    'notes/onboarding_knowledge_faq.md': coveOnboardingFaq,
    'notes/onboarding_playbook.md': coveOnboardingPlaybook,
    'notes/onboarding_objectives.md': renderCoveObjectives(),
} as const;

const coveFactoryGuidanceFiles = {
    'notes/onboarding_knowledge_faq.md': coveOnboardingFaq,
    'notes/onboarding_playbook.md': coveOnboardingPlaybook,
} as const;

export type CoveWorkspaceFile = keyof typeof coveFiles;
export type CoveFactoryGuidanceFile = keyof typeof coveFactoryGuidanceFiles;
export type CoveFactoryGuidancePlan =
    | { kind: 'conflict'; files: CoveFactoryGuidanceFile[] }
    | { kind: 'current' }
    | { kind: 'refresh'; files: CoveFactoryGuidanceFile[] };
export const coveWorkspaceFiles = Object.keys(coveFiles).sort() as CoveWorkspaceFile[];
const coveWorkspaceInventory = [...coveWorkspaceFiles, 'notes/'].sort();

export async function seedCoveWorkspace(workspaceDir: string): Promise<string> {
    await fs.mkdir(workspaceDir, { recursive: true });
    for (const [name, content] of Object.entries(coveFiles)) {
        const destination = path.join(workspaceDir, name);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, content, { flag: 'wx' }).catch((error) => {
            if (!isExists(error)) {
                throw error;
            }
        });
    }
    return await validateCoveWorkspace(workspaceDir);
}

/** The digest a durable Cove receipt records: each factory file name and its bytes, in order. */
export function coveFactoryManifestSha256() {
    const hash = createHash('sha256');
    for (const name of coveWorkspaceFiles) {
        hash.update(name);
        hash.update(Buffer.from(coveFiles[name]));
    }
    return hash.digest('hex');
}

export async function validateCoveWorkspace(workspaceDir: string): Promise<string> {
    const entries = await readWorkspaceInventory(workspaceDir);
    if (JSON.stringify(entries) !== JSON.stringify(coveWorkspaceInventory)) {
        throw new Error(
            `Cove workspace inventory does not match the factory seed: ${entries.join(', ')}`
        );
    }
    const hash = createHash('sha256');
    for (const name of coveWorkspaceFiles) {
        const actual = await fs.readFile(path.join(workspaceDir, name));
        const expected = Buffer.from(coveFiles[name]);
        if (!actual.equals(expected)) {
            throw new Error(`Cove workspace contents do not match the factory seed: ${name}`);
        }
        hash.update(name);
        hash.update(actual);
    }
    return hash.digest('hex');
}

async function readWorkspaceInventory(
    directory: string,
    relativeDirectory = ''
): Promise<string[]> {
    const inventory: string[] = [];
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        // macOS writes .fseventsd onto the root of the mounted workspace volume.
        if (!relativeDirectory && entry.name === '.fseventsd') {
            continue;
        }
        const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
        inventory.push(`${relativePath}${entry.isDirectory() ? '/' : ''}`);
        if (entry.isDirectory()) {
            inventory.push(
                ...(await readWorkspaceInventory(path.join(directory, entry.name), relativePath))
            );
        }
    }
    return inventory.sort();
}

/**
 * Classifies only the two immutable factory guidance files. Learned memory and
 * onboarding progress remain Agent-owned and are never candidates for refresh.
 */
export async function inspectCoveFactoryGuidance(
    workspaceDir: string
): Promise<CoveFactoryGuidancePlan> {
    const refresh: CoveFactoryGuidanceFile[] = [];
    const conflicts: CoveFactoryGuidanceFile[] = [];
    for (const name of Object.keys(coveFactoryGuidanceFiles) as CoveFactoryGuidanceFile[]) {
        const actual = await fs.readFile(path.join(workspaceDir, name)).catch((error: unknown) => {
            if (isNotFound(error)) {
                return null;
            }
            throw error;
        });
        if (actual?.equals(Buffer.from(coveFactoryGuidanceFiles[name]))) {
            continue;
        }
        const hash = actual ? createHash('sha256').update(actual).digest('hex') : null;
        if (hash && recognizedFactoryGuidanceHashes[name].includes(hash)) {
            refresh.push(name);
        } else {
            conflicts.push(name);
        }
    }
    if (conflicts.length > 0) {
        return { files: conflicts, kind: 'conflict' };
    }
    return refresh.length > 0 ? { files: refresh, kind: 'refresh' } : { kind: 'current' };
}

/**
 * Replaces recognized prior factory revisions with current bytes. The plan is
 * revalidated per file before replacement. Keep the outgoing inode while checking
 * for concurrent in-place edits; arbitrary external atomic replacement has no file CAS.
 */
export async function reconcileCoveFactoryGuidance(
    workspaceDir: string
): Promise<CoveFactoryGuidancePlan> {
    const plan = await inspectCoveFactoryGuidance(workspaceDir);
    if (plan.kind !== 'refresh') {
        return plan;
    }
    for (const name of plan.files) {
        if (
            !(await refreshCoveGuidanceFile(
                path.join(workspaceDir, name),
                coveFactoryGuidanceFiles[name],
                recognizedFactoryGuidanceHashes[name]
            ))
        ) {
            return { files: [name], kind: 'conflict' };
        }
    }
    return plan;
}

function isExists(error: unknown): boolean {
    return (
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST'
    );
}

function isNotFound(error: unknown): boolean {
    return (
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
    );
}
