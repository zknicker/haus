import { type AgentRuntimeSkillFile, agentRuntimeSkillFileSchema } from './contracts.ts';

function normalizePathSlashes(value: string) {
    return value.replaceAll('\\', '/');
}

export function normalizeAgentRuntimeSkillFilePath(value: string) {
    const normalized = normalizePathSlashes(value.trim());

    if (normalized.length === 0) {
        throw new Error('Skill file paths cannot be empty.');
    }

    if (normalized.startsWith('/')) {
        throw new Error(`Skill file path "${normalized}" must be relative.`);
    }

    const segments = normalized.split('/');

    if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
        throw new Error(`Skill file path "${normalized}" is invalid.`);
    }

    return segments.join('/');
}

export function isReservedAgentRuntimeSkillFilePath(value: string) {
    return normalizeAgentRuntimeSkillFilePath(value).toLowerCase() === 'skill.md';
}

export function normalizeAgentRuntimeSkillFiles(input: AgentRuntimeSkillFile[]) {
    const seenPaths = new Set<string>();

    return input
        .map((file) => {
            const parsed = agentRuntimeSkillFileSchema.parse(file);
            const normalizedPath = normalizeAgentRuntimeSkillFilePath(parsed.path);

            return {
                path: normalizedPath,
                sizeBytes: parsed.sizeBytes,
            } satisfies AgentRuntimeSkillFile;
        })
        .sort((left, right) => left.path.localeCompare(right.path))
        .filter((file) => {
            if (seenPaths.has(file.path)) {
                throw new Error(`Duplicate skill file path "${file.path}".`);
            }

            seenPaths.add(file.path);
            return true;
        });
}
