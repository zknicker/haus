/// <reference path="./visuals-skill/markdown.d.ts" />

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

const factoryManagedSkillFiles: Record<string, Record<string, string>> = {
    [visualsSkillId]: { 'SKILL.md': defaultVisualsSkill, ...visualsSkillFiles },
};

/** Restores release-owned skill files while preserving every Agent-authored skill. */
export async function seedFactoryManagedSkills(skillsDir: string): Promise<void> {
    for (const [skillId, files] of Object.entries(factoryManagedSkillFiles)) {
        for (const [relativePath, content] of Object.entries(files)) {
            const destination = path.join(skillsDir, skillId, ...relativePath.split('/'));
            await fs.mkdir(path.dirname(destination), { recursive: true });
            await fs.writeFile(destination, content, { mode: 0o600 });
        }
    }
}
