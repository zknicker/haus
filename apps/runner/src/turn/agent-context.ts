import type { RunAuthority } from '../run-context.ts';
import { readAgentHandle, readDriveText, readSkillListing } from './agent-drive.ts';

export interface RuleFile {
    readonly content: string | null;
    readonly path: string;
}

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
        return { memory: null, rules: [], skills: [] };
    }
    const [memory, rules, skills] = await Promise.all([
        readDriveText(input.authority, `agents/${handle}/MEMORY.md`).catch((error: unknown) => {
            input.log(`Runner could not read ${handle}'s MEMORY.md: ${String(error)}`);
            return null;
        }),
        readRuleFiles(input, handle),
        readSkillListing(input.authority, handle).catch((error: unknown) => {
            input.log(`Runner could not list ${handle}'s skills: ${String(error)}`);
            return [];
        }),
    ]);
    return { memory, rules, skills };
}

function ruleLayerPaths(handle: string) {
    return ['haus/AGENTS.md', `agents/${handle}/AGENTS.md`];
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
