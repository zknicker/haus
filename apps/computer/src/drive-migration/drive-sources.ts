import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { seedAgentWorkspace, seedFactoryManagedSkills } from '@haus/agent-workspace';
import type { AgentDrive } from '../drive/agent-drive.ts';
import type { AgentSeedConfiguration } from './seed-configuration.ts';

export interface DriveSeedEntry {
    bytes: Uint8Array;
    drivePath: string;
    legacyPath: string | null;
    sha256: string;
}

const skippedDirectories = new Set(['.git', 'node_modules', '__pycache__']);
const skippedFiles = new Set(['.DS_Store', '.ai-sdk-harness-skills.json']);

export function legacyRoots(agentRoot: string) {
    const workspace = join(agentRoot, 'workspace');
    return {
        memory: join(workspace, 'MEMORY.md'),
        notes: join(workspace, 'notes'),
        pages: join(workspace, 'pages'),
        skills: join(agentRoot, 'skills'),
        workbench: join(workspace, 'workbench'),
    };
}

export async function legacyFiles(agentRoot: string) {
    const roots = legacyRoots(agentRoot);
    const files: { areaPath: string; source: string }[] = [];
    for (const target of ['notes', 'pages', 'skills', 'workbench'] as const) {
        for (const relative of await regularFiles(roots[target])) {
            files.push({
                areaPath: `${target}/${relative}`,
                source: join(roots[target], ...relative.split('/')),
            });
        }
    }
    if ((await lstat(roots.memory).catch(missingAs(null)))?.isFile()) {
        files.push({ areaPath: 'MEMORY.md', source: roots.memory });
    }
    return files;
}

export async function legacyEntries(agentRoot: string, drive: AgentDrive) {
    const entries: DriveSeedEntry[] = [];
    for (const file of await legacyFiles(agentRoot)) {
        entries.push(await entryOf(drive, file.areaPath, file.source, file.source));
    }
    return entries;
}

export async function seedEntries(
    agentRoot: string,
    drive: AgentDrive,
    seed: AgentSeedConfiguration
) {
    const scratch = join(agentRoot, 'runtime', `drive-seed-${randomBytes(8).toString('hex')}`);
    const workspace = join(scratch, 'workspace');
    const skills = join(scratch, 'skills');
    await mkdir(workspace, { mode: 0o700, recursive: true });
    try {
        await seedAgentWorkspace({
            agentName: seed.agentName,
            bio: seed.agentDescription,
            brief: seed.brief,
            briefAuthorHandle: seed.briefAuthorHandle,
            workspaceDir: workspace,
        });
        await seedFactoryManagedSkills(skills);
        const entries: DriveSeedEntry[] = [];
        for (const relative of await regularFiles(skills)) {
            entries.push(
                await entryOf(
                    drive,
                    `skills/${relative}`,
                    join(skills, ...relative.split('/')),
                    null
                )
            );
        }
        for (const relative of (await regularFiles(workspace)).sort(memoryLast)) {
            entries.push(
                await entryOf(drive, relative, join(workspace, ...relative.split('/')), null)
            );
        }
        return entries;
    } finally {
        await rm(scratch, { force: true, recursive: true });
    }
}

export function sha256Of(bytes: Uint8Array) {
    return createHash('sha256').update(bytes).digest('hex');
}

async function entryOf(
    drive: AgentDrive,
    areaPath: string,
    source: string,
    legacyPath: string | null
) {
    const bytes = new Uint8Array(await readFile(source));
    return {
        bytes,
        drivePath: `agents/${drive.handle}/${areaPath}`,
        legacyPath,
        sha256: sha256Of(bytes),
    } satisfies DriveSeedEntry;
}

async function regularFiles(root: string) {
    const files: string[] = [];
    const pending = [''];
    for (let prefix = pending.pop(); prefix !== undefined; prefix = pending.pop()) {
        const directory = prefix ? join(root, ...prefix.split('/')) : root;
        const entries = await readdir(directory, { withFileTypes: true }).catch(missingAs([]));
        for (const entry of entries) {
            const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isDirectory() && !skippedDirectories.has(entry.name)) {
                pending.push(relative);
            } else if (entry.isFile() && !skippedFiles.has(entry.name)) {
                files.push(relative);
            }
        }
    }
    return files.sort();
}

function memoryLast(left: string, right: string) {
    return Number(left === 'MEMORY.md') - Number(right === 'MEMORY.md');
}

function missingAs<T>(value: T) {
    return (error: unknown) => {
        if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) {
            return value;
        }
        throw error;
    };
}
