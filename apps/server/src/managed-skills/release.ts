import { createHash } from 'node:crypto';
import { factoryManagedSkillFiles } from '@haus/agent-workspace';
import { artifactPathKey, inferAttachmentMediaType } from '@haus/api';

export interface ManagedSkillFile {
    readonly bytes: Uint8Array;
    readonly contentType: string;
    readonly path: string;
    readonly sha256: string;
}

export interface ManagedSkill {
    readonly files: readonly ManagedSkillFile[];
    readonly fingerprint: string;
    readonly id: string;
}

export type ManagedSkillRelease = readonly ManagedSkill[];

export function managedSkillRelease(
    skills: Readonly<Record<string, Readonly<Record<string, string>>>>
) {
    const encoder = new TextEncoder();
    return Object.entries(skills).map(([id, files]) => {
        const entries = Object.entries(files).map(([path, text]) => {
            const bytes = encoder.encode(text);
            const file: ManagedSkillFile = {
                bytes,
                contentType: inferAttachmentMediaType(path, bytes.subarray(0, 512)),
                path,
                sha256: sha256(bytes),
            };
            return file;
        });
        const skill: ManagedSkill = { files: entries, fingerprint: skillFingerprint(entries), id };
        return skill;
    }) satisfies ManagedSkillRelease;
}

export const factoryRelease = managedSkillRelease(factoryManagedSkillFiles);

export function skillFingerprint(files: Iterable<{ path: string; sha256: string }>) {
    const hash = createHash('sha256');
    const sorted = [...files]
        .map((file) => [artifactPathKey(file.path), file.sha256] as const)
        .sort(([left], [right]) => (left < right ? -1 : Number(left > right)));
    for (const [path, digest] of sorted) {
        hash.update(path).update('\0').update(digest).update('\0');
    }
    return hash.digest('hex');
}

export function sha256(bytes: Uint8Array) {
    return createHash('sha256').update(bytes).digest('hex');
}
