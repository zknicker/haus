// Swaps the seeded visuals skill's authored markdown for a revision kept on
// disk, so one run can be measured against another revision of the skill text.
//
// Driven by the visuals lab (`bun run visuals:lab`), which materializes the
// "before" revision out of a git ref. It has no command of its own.
//
// The variant directory IS the authored skill, not a patch on top of it: a
// module or fragment the variant does not carry is removed from the seeded
// copy rather than left behind. Otherwise a revision that predates
// `fragments/` would run with today's fences sitting beside its old SKILL.md,
// and the comparison would measure neither revision.
//
// Only the authored markdown is swapped; the generated icon manifest and SVG
// assets always stay as `seedFactoryManagedSkills` wrote them.
import { existsSync, readdirSync } from 'node:fs';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { visualsSkillId } from '../../../packages/agent-workspace/src/index.ts';
import { skillModules } from './skill-fragments.mjs';

/** `SKILL.md` at the root, every topic module under `references/`. */
const overridableFiles = {
    'SKILL.md': 'SKILL.md',
    ...Object.fromEntries(skillModules.map((name) => [name, `references/${name}`])),
};

/** Replaces the seeded skill's markdown with `skillDir`; returns the names applied. */
export const overrideVisualsSkill = async (skillsDir, skillDir) => {
    if (!existsSync(path.join(skillDir, 'SKILL.md'))) {
        throw new Error(`${skillDir} carries no SKILL.md, so it is not a skill revision`);
    }
    const root = path.join(skillsDir, visualsSkillId);
    const applied = [];
    for (const [source, seeded] of Object.entries(overridableFiles)) {
        const from = path.join(skillDir, source);
        const to = path.join(root, ...seeded.split('/'));
        if (existsSync(from)) {
            await copyFile(from, to);
            applied.push(source);
        } else {
            await rm(to, { force: true });
        }
    }
    applied.push(...(await overrideFragments(root, path.join(skillDir, 'fragments'))));
    return applied;
};

/** Mirrors the variant's `fragments/` into the seeded `references/fragments/`. */
async function overrideFragments(root, fragmentsDir) {
    const target = path.join(root, 'references', 'fragments');
    const carried = existsSync(fragmentsDir)
        ? readdirSync(fragmentsDir).filter((name) => name.endsWith('.md'))
        : [];
    if (carried.length === 0) {
        await rm(target, { force: true, recursive: true });
        return [];
    }
    await mkdir(target, { recursive: true });
    for (const stale of readdirSync(target).filter((name) => !carried.includes(name))) {
        await rm(path.join(target, stale), { force: true, recursive: true });
    }
    for (const file of carried) {
        await copyFile(path.join(fragmentsDir, file), path.join(target, file));
    }
    return carried.map((file) => `fragments/${file}`);
}
