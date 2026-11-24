import { type RuleFile, ruleLayerPaths } from '@haus/agent-prompt';
import type { RunAuthority } from '../run-context.ts';
import { readAgentProfile, readDriveText, readSkillListing } from './agent-drive.ts';
import { readManagedSkillNotice } from './managed-skill-notice.ts';

interface ContextReader {
    readonly authority: RunAuthority;
    readonly log: (line: string) => void;
}

export async function readAgentContext(input: ContextReader) {
    const profile = await readAgentProfile(input.authority).catch((error: unknown) => {
        input.log(`Runner could not read the Agent's profile: ${String(error)}`);
        return null;
    });
    if (!profile) {
        return { memory: null, rules: [], skillNotice: null, skills: [] };
    }
    const { handle } = profile;
    const [memory, rules, skills, skillNotice] = await Promise.all([
        readDriveText(input.authority, `agents/${handle}/MEMORY.md`).catch((error: unknown) => {
            input.log(`Runner could not read ${handle}'s MEMORY.md: ${String(error)}`);
            return null;
        }),
        readRuleFiles(input, ruleLayerPaths(profile)),
        readSkillListing(input.authority, handle).catch((error: unknown) => {
            input.log(`Runner could not list ${handle}'s skills: ${String(error)}`);
            return [];
        }),
        readManagedSkillNotice(input.authority).catch((error: unknown) => {
            input.log(`Runner could not read ${handle}'s skill update notice: ${String(error)}`);
            return null;
        }),
    ]);
    return { memory, rules, skillNotice, skills };
}

async function readRuleFiles(input: ContextReader, paths: readonly string[]) {
    const files = await Promise.all(
        paths.map((path) =>
            readDriveText(input.authority, path).then(
                (content) => {
                    const file: RuleFile = { content, path };
                    return file;
                },
                (error: unknown) => {
                    input.log(`Runner could not read ${path}: ${String(error)}`);
                    return null;
                }
            )
        )
    );
    return files.filter((file) => file !== null);
}
