import type { RuleFile } from '@haus/agent-prompt';
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
        return { memory: null, policy: null, rules: [], skillNotice: null, skills: [] };
    }
    const { handle, session } = profile;
    const [memory, rules, skills, skillNotice] = await Promise.all([
        session.memoryPath === null
            ? null
            : readDriveText(input.authority, session.memoryPath).catch((error: unknown) => {
                  input.log(`Runner could not read ${session.memoryPath}: ${String(error)}`);
                  return null;
              }),
        readRuleFiles(input, session.rulePaths),
        readSkillListing(input.authority, handle).catch((error: unknown) => {
            input.log(`Runner could not list ${handle}'s skills: ${String(error)}`);
            return [];
        }),
        readManagedSkillNotice(input.authority).catch((error: unknown) => {
            input.log(`Runner could not read ${handle}'s skill update notice: ${String(error)}`);
            return null;
        }),
    ]);
    return { memory, policy: session, rules, skillNotice, skills };
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
