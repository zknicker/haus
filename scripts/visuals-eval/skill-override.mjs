// Swaps the seeded visuals skill's authored markdown for a variant kept on
// disk, so one run can be measured against another revision of the skill text.
//
// Only the authored markdown is swappable; the generated icon manifest and SVG
// assets always stay as `seedFactoryManagedSkills` wrote them. A file the
// variant directory does not carry keeps the seeded default, so a variant can
// be a single overridden module.
import { existsSync, readdirSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { visualsSkillId } from '../../packages/agent-workspace/src/index.ts';
import { skillModules } from './skill-fragments.mjs';

/** `SKILL.md` at the root, every topic module under `references/`. */
const overridableFiles = {
    'SKILL.md': 'SKILL.md',
    ...Object.fromEntries(skillModules.map((name) => [name, `references/${name}`])),
};

/** Overwrites seeded skill files from `skillDir`; returns the names applied. */
export const overrideVisualsSkill = async (skillsDir, skillDir) => {
    const applied = [];
    for (const [source, seeded] of Object.entries(overridableFiles)) {
        const from = path.join(skillDir, source);
        if (existsSync(from)) {
            await copyFile(from, path.join(skillsDir, visualsSkillId, ...seeded.split('/')));
            applied.push(source);
        }
    }
    // A variant may also carry its own fragments/, which is how one revision of
    // a single fence is measured against another.
    const fragments = path.join(skillDir, 'fragments');
    if (existsSync(fragments)) {
        const target = path.join(skillsDir, visualsSkillId, 'references', 'fragments');
        await mkdir(target, { recursive: true });
        for (const file of readdirSync(fragments).filter((name) => name.endsWith('.md'))) {
            await copyFile(path.join(fragments, file), path.join(target, file));
            applied.push(`fragments/${file}`);
        }
    }
    return applied;
};
