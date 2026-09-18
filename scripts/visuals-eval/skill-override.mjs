// Swaps the seeded visuals skill's authored markdown for a variant kept on
// disk, so one run can be measured against another revision of the skill text.
//
// Only the three authored files are swappable; the generated icon manifest and
// SVG assets always stay as `seedFactoryManagedSkills` wrote them. A file the
// variant directory does not carry keeps the seeded default, so a variant can
// be a single overridden page.
import { existsSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import { visualsSkillId } from '../../packages/agent-workspace/src/index.ts';

const overridableFiles = {
    'SKILL.md': 'SKILL.md',
    'design-system.md': 'references/design-system.md',
    'icons.md': 'references/icons.md',
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
    return applied;
};
