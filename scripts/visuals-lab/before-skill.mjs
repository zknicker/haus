// The "before" side of the comparison: the visuals skill as it was at a git
// ref, materialized on disk so a run can be pointed at it.
//
// A hand-copied snapshot rots the moment someone edits it, so the lab keeps no
// snapshot at all — it reads the revision out of git. The default ref is the
// newest `v*` tag reachable from HEAD, which is the last thing that shipped;
// `VISUALS_LAB_BEFORE_REF` overrides it.
//
// The skill's own layout changed over time: old refs carry a flat SKILL.md plus
// two modules, newer ones carry topic modules and a `fragments/` directory.
// Both fall out of the same listing, and `overrideVisualsSkill` replaces the
// seeded markdown wholesale, so a revision that predates `fragments/` runs
// without today's fences.
import { existsSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** The repository this lab ships in; every git read below runs against it. */
export const repoRoot = path.resolve(here, '../..');

const skillPath = 'packages/agent-workspace/src/visuals-skill';
const cacheRoot = path.join(tmpdir(), 'haus-visuals-lab-before');

/** The ref the lab compares against, unless `VISUALS_LAB_BEFORE_REF` says otherwise. */
export const beforeRef = () =>
    process.env.VISUALS_LAB_BEFORE_REF?.trim() ||
    git(['describe', '--tags', '--abbrev=0', '--match', 'v*', 'HEAD']).trim();

/**
 * The authored markdown a revision carried: `SKILL.md` and its sibling modules,
 * plus `fragments/*.md`. The generated `.ts` sources and the type shim are not
 * skill text and never travel.
 */
export const authoredSkillFiles = (treeListing) =>
    treeListing
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith(`${skillPath}/`))
        .map((line) => line.slice(skillPath.length + 1))
        .filter(
            (rel) => rel.endsWith('.md') && (!rel.includes('/') || rel.startsWith('fragments/'))
        )
        .sort();

// One write per commit, even when five cells ask at once. "Run everything"
// starts every model's before-run together, and they all want the same
// directory; without this they would each stage into it and one would rename a
// half-written skill into place — the exact measurement error this mechanism
// exists to prevent.
const building = new Map();

/**
 * Writes the revision's skill text into a cache directory keyed by its commit,
 * and answers where it landed. A finished directory is reused as-is; commits
 * do not change, so neither does what was written from one.
 */
export const materializeBeforeSkill = (ref) => {
    const sha = git(['rev-parse', `${ref}^{commit}`]).trim();
    const files = authoredSkillFiles(git(['ls-tree', '-r', '--name-only', sha, '--', skillPath]));
    if (files.length === 0) {
        throw new Error(`${ref} (${sha.slice(0, 8)}) carries no visuals skill markdown`);
    }
    if (!building.has(sha)) {
        building.set(
            sha,
            writeRevision(sha, files).catch((error) => {
                building.delete(sha);
                throw error;
            })
        );
    }
    return building.get(sha).then((dir) => ({ dir, files, ref, sha }));
};

async function writeRevision(sha, files) {
    const dir = path.join(cacheRoot, sha);
    const done = `${dir}.done`;
    if (existsSync(done)) {
        return dir;
    }
    const staging = `${dir}.partial`;
    await rm(staging, { force: true, recursive: true });
    for (const file of files) {
        const target = path.join(staging, file);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, git(['show', `${sha}:${skillPath}/${file}`]));
    }
    await rm(dir, { force: true, recursive: true });
    await rename(staging, dir);
    await writeFile(done, `${sha}\n`);
    return dir;
}

/** Fails loudly: a ref the lab cannot read is a broken comparison, not a warning. */
function git(args) {
    const result = Bun.spawnSync(['git', ...args], { cwd: repoRoot });
    if (result.exitCode !== 0) {
        throw new Error(`git ${args.join(' ')} failed: ${result.stderr.toString().trim()}`);
    }
    return result.stdout.toString();
}
