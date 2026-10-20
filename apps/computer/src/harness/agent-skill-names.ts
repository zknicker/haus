import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Names the skills in the Agent's canonical, writable library (ADR 0019), for the prompt's
 * activation hints. Each immediate subdirectory with a `SKILL.md` is one skill, named by its
 * frontmatter `name` when that is a usable directory name, else by the directory. Runtimes read
 * the library natively through `ensureNativeSkillLinks`; nothing here is handed to them.
 */
export async function readAgentSkillNames(skillsDir: string): Promise<string[]> {
    let entries: string[];
    try {
        entries = await readdir(skillsDir);
    } catch {
        return [];
    }
    const names: string[] = [];
    for (const entry of entries.sort()) {
        const content = await readFile(join(skillsDir, entry, 'SKILL.md'), 'utf8').catch(
            () => null
        );
        if (content !== null) {
            const name = frontmatterName(content);
            names.push(isSkillName(name) ? name : entry);
        }
    }
    return names;
}

const FRONTMATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/u;
const NAME_FIELD = /^name:[ \t]*(.*)$/mu;

function frontmatterName(content: string): string | undefined {
    const block = FRONTMATTER.exec(content)?.[1];
    const raw = block ? NAME_FIELD.exec(block)?.[1]?.trim() : undefined;
    return raw?.replace(/^(["'])(.*)\1$/u, '$2');
}

function isSkillName(value: string | undefined): value is string {
    return (
        value !== undefined && value !== '.' && value !== '..' && /^[A-Za-z0-9._-]+$/u.test(value)
    );
}
