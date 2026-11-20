import { type RuleFile, ruleLayerPaths } from '@haus/agent-prompt';
import type { RunAuthority } from '../run-context.ts';
import { readAgentHandle, readDriveText, readSkillListing } from './agent-drive.ts';
import { readManagedSkillNotice } from './managed-skill-notice.ts';

interface ContextReader {
    readonly authority: RunAuthority;
    readonly log: (line: string) => void;
}

export async function readAgentContext(input: ContextReader) {
    const handle = await readAgentHandle(input.authority).catch((error: unknown) => {
        input.log(`Runner could not read the Agent's handle: ${String(error)}`);
        return null;
    });
    if (!handle) {
        return { memory: null, rules: [], skillNotice: null, skills: [] };
    }
    const [memory, rules, skills, skillNotice] = await Promise.all([
        readDriveText(input.authority, `agents/${handle}/MEMORY.md`).catch((error: unknown) => {
            input.log(`Runner could not read ${handle}'s MEMORY.md: ${String(error)}`);
            return null;
        }),
        readRuleFiles(input, handle),
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

async function readRuleFiles(input: ContextReader, handle: string) {
    const files = await Promise.all(
        ruleLayerPaths(handle).map((path) =>
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
