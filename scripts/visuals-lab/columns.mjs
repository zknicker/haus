// The lab's columns: one model under one skill.
//
// The skills are the in-repo visuals skill ("Current": whatever
// packages/agent-workspace/src/visuals-skill holds right now) plus every
// revision kept under `scripts/visuals-lab/skills/<name>/` (gitignored, like
// results). A column is a model crossed with a skill. Under Current its id is
// the model's own id, so `results/<model>/` keeps meaning what it always did;
// under a revision it is `<model>@<name>`, its runs pass `--skill-dir`, and they
// land in `results/<model>@<name>/<stamp>/`.
//
// A revision may carry a `lab.json` beside its SKILL.md: lab metadata, never
// copied into the seeded skill. `{"preview": true}` runs its columns with
// `--preview`, which puts a `haus` shim on the turn's PATH so the agent can
// call `haus visual preview` (harness-runner.mjs).
//
// Every pair is a column; the page's selection, not this file, decides which
// ones get run. Skills are read at request time, so dropping a directory in
// shows up on reload.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { models } from './models.mjs';

export const variantsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'skills');

export const currentSkill = {
    id: 'current',
    label: 'Current',
    preview: false,
    skillDir: null,
    source: 'packages/agent-workspace/src/visuals-skill',
};

/** Path-safe: a skill name becomes part of a results directory and a URL. */
const variantName = /^[a-z0-9][a-z0-9.-]*$/u;

/** Current first, then every revision directory by name. */
export const readSkills = (dir = variantsDir) => [currentSkill, ...readVariants(dir)];

/** Every model under every skill, model-major. */
export const readColumns = (lineup = models, dir = variantsDir) => {
    const skills = readSkills(dir);
    return lineup.flatMap((spec) =>
        skills.map((skill) => ({
            ...spec,
            id: columnId(spec.id, skill.id),
            modelId: spec.id,
            preview: skill.preview,
            skill: skill.id,
            skillDir: skill.skillDir,
        }))
    );
};

export const columnId = (modelId, skillId) =>
    skillId === currentSkill.id ? modelId : `${modelId}@${skillId}`;

export const columnById = (id, columns = readColumns()) =>
    columns.find((column) => column.id === id) ?? null;

/** Directories under `dir` that carry a SKILL.md and a path-safe, unreserved name. */
export const readVariants = (dir = variantsDir) => {
    if (!existsSync(dir)) {
        return [];
    }
    return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && variantName.test(entry.name))
        .filter((entry) => entry.name !== currentSkill.id)
        .filter((entry) => existsSync(path.join(dir, entry.name, 'SKILL.md')))
        .map((entry) => ({
            id: entry.name,
            label: entry.name,
            preview: readLabMarker(path.join(dir, entry.name)).preview === true,
            skillDir: path.join(dir, entry.name),
            source: `scripts/visuals-lab/skills/${entry.name}`,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
};

/** The revision's `lab.json`, or `{}` when it has none. A malformed one is an error, not a default. */
const readLabMarker = (skillDir) => {
    const file = path.join(skillDir, 'lab.json');
    if (!existsSync(file)) {
        return {};
    }
    try {
        return JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
        throw new Error(`${file} is not valid JSON: ${String(error)}`);
    }
};
