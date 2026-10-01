import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, realpath, rename, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type { AgentSkillImportCommand, AgentSkillMetadata, ImportableSkill } from '@haus/api';
import {
    copySkillBundle,
    readSkillBundle,
    skillDescription,
    skillNamePattern,
} from './host-skill-bundle.ts';

export {
    acceptHostSkillImport,
    finishHostSkillImport,
    listAcceptedHostSkillImports,
    listAgentSkillImportReports,
} from './host-skill-import-store.ts';

export interface HostSkillSource extends ImportableSkill {
    directory: string;
}

export function parseAgentSkillImportCommand(frame: unknown): AgentSkillImportCommand | null {
    if (
        !isRecord(frame) ||
        frame.type !== 'agent-skill-import' ||
        ![frame.agentId, frame.requestId, frame.sourceId].every(isId)
    ) {
        return null;
    }
    return frame as unknown as AgentSkillImportCommand;
}

export async function listImportableSkills(
    roots = defaultImportRoots()
): Promise<ImportableSkill[]> {
    return (await scanHostSkills(roots)).map(({ directory: _, ...metadata }) => metadata);
}

export async function listAgentSkillReports(dataRoot: string, serverId: string) {
    const agentsRoot = join(dataRoot, 'servers', serverId, 'agents');
    const agents = await readdir(agentsRoot, { withFileTypes: true }).catch(() => []);
    return await Promise.all(
        agents
            .filter((entry) => entry.isDirectory() && isId(entry.name))
            .sort((left, right) => left.name.localeCompare(right.name))
            .map(async (entry) => ({
                agentId: entry.name,
                skills: await listSkillMetadata(join(agentsRoot, entry.name, 'skills')),
            }))
    );
}

export async function importHostSkill(input: {
    agentId: string;
    dataRoot: string;
    roots?: string[];
    serverId: string;
    sourceId: string;
}): Promise<AgentSkillMetadata> {
    const source = await findHostSkillSource(input.sourceId, input.roots);
    if (!source) {
        throw new Error('That host skill is no longer available.');
    }
    const skillsDir = join(
        input.dataRoot,
        'servers',
        input.serverId,
        'agents',
        input.agentId,
        'skills'
    );
    await mkdir(skillsDir, { mode: 0o700, recursive: true });
    const destination = join(skillsDir, source.name);
    if (await lstat(destination).catch(() => null)) {
        throw new Error(`The Agent already has a skill named "${source.name}".`);
    }
    const temporary = join(skillsDir, `.import-${randomBytes(8).toString('hex')}`);
    await mkdir(temporary, { mode: 0o700 });
    try {
        await copySkillBundle(await readSkillBundle(source.directory), temporary);
        await rename(temporary, destination);
    } catch (error) {
        await rm(temporary, { force: true, recursive: true });
        throw error;
    }
    const [metadata] = await listSkillMetadata(skillsDir, source.name);
    if (!metadata) {
        throw new Error('The imported skill could not be verified.');
    }
    return metadata;
}

/** Resolves an opaque reported source id against a fresh scan of the host roots. */
export async function findHostSkillSource(
    sourceId: string,
    roots = defaultImportRoots()
): Promise<HostSkillSource | null> {
    return (await scanHostSkills(roots)).find((candidate) => candidate.id === sourceId) ?? null;
}

async function scanHostSkills(roots: string[]): Promise<HostSkillSource[]> {
    const seenDirectories = new Set<string>();
    const seenNames = new Set<string>();
    const found: HostSkillSource[] = [];
    for (const root of roots) {
        const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
            const candidate = join(root, entry.name);
            const directory = await realpath(candidate).catch(() => null);
            const info = directory ? await stat(directory).catch(() => null) : null;
            if (!(directory && info?.isDirectory()) || seenDirectories.has(directory)) {
                continue;
            }
            const name = basename(directory);
            const normalizedName = name.toLowerCase();
            if (
                name.length > 128 ||
                !skillNamePattern.test(name) ||
                seenNames.has(normalizedName)
            ) {
                continue;
            }
            const content = await readFile(join(directory, 'SKILL.md'), 'utf8').catch(() => null);
            if (content === null) {
                continue;
            }
            seenDirectories.add(directory);
            seenNames.add(normalizedName);
            found.push({
                description: skillDescription(content),
                directory,
                id: sourceId(directory),
                name,
                source: shortPath(candidate),
            });
        }
    }
    return found.sort(
        (left, right) =>
            left.name.localeCompare(right.name) || left.source.localeCompare(right.source)
    );
}

async function listSkillMetadata(
    skillsDir: string,
    onlyName?: string
): Promise<AgentSkillMetadata[]> {
    const entries = await readdir(skillsDir, { withFileTypes: true }).catch(() => []);
    const metadata = await Promise.all(
        entries
            .filter(
                (entry) =>
                    entry.isDirectory() &&
                    entry.name.length <= 128 &&
                    skillNamePattern.test(entry.name) &&
                    (!onlyName || entry.name === onlyName)
            )
            .map(async (entry) => {
                const directory = join(skillsDir, entry.name);
                const content = await readFile(join(directory, 'SKILL.md'), 'utf8').catch(
                    () => null
                );
                if (content === null) {
                    return null;
                }
                const files = await readSkillBundle(directory).catch(() => null);
                if (!files?.length) {
                    return null;
                }
                const modifiedAt = new Date(
                    Math.max(...files.map((file) => file.modifiedAt))
                ).toISOString();
                const hash = createHash('sha256');
                for (const file of files) {
                    hash.update(file.path);
                    hash.update(file.content);
                }
                return {
                    description: skillDescription(content),
                    hash: hash.digest('hex'),
                    modifiedAt,
                    name: entry.name,
                };
            })
    );
    return metadata
        .filter((item): item is AgentSkillMetadata => item !== null)
        .sort((left, right) => left.name.localeCompare(right.name));
}

function defaultImportRoots() {
    const home = homedir();
    return [
        join(home, '.agents', 'skills'),
        join(home, '.claude', 'skills'),
        join(home, '.codex', 'skills'),
    ];
}

function sourceId(path: string) {
    return `hsk_${createHash('sha256').update(path).digest('base64url').slice(0, 16)}`;
}

function shortPath(path: string) {
    const home = homedir();
    return path.startsWith(`${home}/`) ? `~/${path.slice(home.length + 1)}` : path;
}

function isId(value: unknown) {
    return typeof value === 'string' && /^[a-z]+_[A-Za-z0-9_-]{16}$/u.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
