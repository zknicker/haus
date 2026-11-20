/// <reference path="./visuals-skill/markdown.d.ts" />

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import antiPatternsMd from './visuals-skill/anti-patterns.md' with { type: 'text' };
import chartsMd from './visuals-skill/charts.md' with { type: 'text' };
import componentsMd from './visuals-skill/components.md' with { type: 'text' };
import designSystemMd from './visuals-skill/design-system.md' with { type: 'text' };
import diagramsMd from './visuals-skill/diagrams.md' with { type: 'text' };
import { visualsSkillFragmentFiles } from './visuals-skill/fragments.ts';
import iconsMd from './visuals-skill/icons.md' with { type: 'text' };
import { visualsSkillIconFiles, visualsSkillIconManifest } from './visuals-skill/icons.ts';
import interactionMd from './visuals-skill/interaction.md' with { type: 'text' };
import marksAndAnatomyMd from './visuals-skill/marks-and-anatomy.md' with { type: 'text' };
import pagesMd from './visuals-skill/pages.md' with { type: 'text' };
import visualsSkillMd from './visuals-skill/SKILL.md' with { type: 'text' };

export const visualsSkillId = 'visuals';

export const defaultVisualsSkill: string = visualsSkillMd;

export const visualsSkillFiles: Record<string, string> = {
    // The core is always read; one topic module follows it and points at the
    // one fragment file to copy.
    'references/design-system.md': designSystemMd,
    'references/charts.md': chartsMd,
    'references/marks-and-anatomy.md': marksAndAnatomyMd,
    'references/interaction.md': interactionMd,
    'references/anti-patterns.md': antiPatternsMd,
    'references/components.md': componentsMd,
    'references/diagrams.md': diagramsMd,
    'references/pages.md': pagesMd,
    'references/icons.md': iconsMd,
    // One fragment per file: a module's index points at the one to copy, so a
    // turn never reads every fence the skill ships.
    ...Object.fromEntries(
        Object.entries(visualsSkillFragmentFiles).map(([file, markdown]) => [
            `references/fragments/${file}`,
            markdown,
        ])
    ),
    'references/icons/manifest.json': `${JSON.stringify({ icons: visualsSkillIconManifest }, null, 2)}\n`,
    ...Object.fromEntries(
        Object.entries(visualsSkillIconFiles).map(([file, svg]) => [`assets/icons/${file}`, svg])
    ),
};

/** Every release-owned skill by id, each as its files by path relative to the skill folder. */
export const factoryManagedSkillFiles: Readonly<Record<string, Readonly<Record<string, string>>>> =
    {
        [visualsSkillId]: { 'SKILL.md': defaultVisualsSkill, ...visualsSkillFiles },
    };

/** Writes the named release-owned skills, every one by default, and leaves every other skill alone. */
export async function seedFactoryManagedSkills(
    skillsDir: string,
    skillIds: readonly string[] = Object.keys(factoryManagedSkillFiles)
): Promise<void> {
    for (const skillId of skillIds) {
        for (const [relativePath, content] of Object.entries(
            factoryManagedSkillFiles[skillId] ?? {}
        )) {
            const destination = path.join(skillsDir, skillId, ...relativePath.split('/'));
            await fs.mkdir(path.dirname(destination), { recursive: true });
            await fs.writeFile(destination, content, { mode: 0o600 });
        }
    }
}

/**
 * One content hash per factory-managed skill over every file it ships, in sorted path order, so
 * a Computer can tell a changed skill from an identical reseed.
 */
export function factoryManagedSkillHashes(): Record<string, string> {
    return Object.fromEntries(
        Object.entries(factoryManagedSkillFiles).map(([skillId, files]) => [
            skillId,
            skillHash(Object.entries(files)),
        ])
    );
}

/**
 * The hash of an Agent's copy of a skill, computed like `factoryManagedSkillHashes` over its
 * regular files, or null when it holds no such directory.
 */
export async function heldManagedSkillHash(skillsDir: string, skillId: string) {
    const root = path.join(skillsDir, skillId);
    const stat = await fs.stat(root).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
            return null;
        }
        throw error;
    });
    if (!stat?.isDirectory()) {
        return null;
    }
    const files: [string, Uint8Array][] = [];
    for (const entry of await fs.readdir(root, { recursive: true, withFileTypes: true })) {
        if (entry.isFile()) {
            const absolute = path.join(entry.parentPath, entry.name);
            files.push([
                path.relative(root, absolute).split(path.sep).join('/'),
                await fs.readFile(absolute),
            ]);
        }
    }
    return skillHash(files);
}

function skillHash(files: readonly (readonly [string, string | Uint8Array])[]) {
    const hash = createHash('sha256');
    for (const [relativePath, content] of [...files].sort(([left], [right]) =>
        left < right ? -1 : Number(left > right)
    )) {
        hash.update(relativePath).update('\0').update(content).update('\0');
    }
    return hash.digest('hex');
}
