import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentExecutionJournal } from '@haus/api';
import { toolFailure, turnFailure } from './execution-journal-failure.ts';
import type {
    ComputerExecutionJournalDocument,
    ComputerExecutionJournalResult,
    ComputerExecutionJournalTool,
    JournalValue,
} from './harness/execution-journal.ts';

/**
 * One absolute Agent directory and what a reader sees in its place: `bare` for the
 * directory itself, `prefix` before a path inside it. The workspace matches the
 * harness patch (`<workspace>`, and inner paths lose the prefix); home reads `~`.
 */
interface PathAlias {
    readonly bare: string;
    readonly prefix: string;
    readonly root: string;
}

/**
 * Shapes a stored journal for the authorized reader. The file on disk stays raw
 * evidence; the served copy names Agent paths relative to its workspace (`~` for its
 * home) so host usernames, Server ids, and Agent ids never reach the App, adds a
 * readable `failure` beside each raw error, and counts each sub-agent's failed calls.
 */
export async function presentExecutionJournal(
    document: ComputerExecutionJournalDocument,
    agentRoot: string
): Promise<AgentExecutionJournal> {
    const relativize = pathRelativizer(await agentPathAliases(agentRoot));
    const failedChildren = countFailedChildren(document.tools);
    const failure = document.status === 'failed' ? turnFailure(document.error) : undefined;
    return {
        ...document,
        ...(failure ? { failure: { ...failure, message: relativize(failure.message) } } : {}),
        reasoning: document.reasoning?.map((block) => ({
            ...block,
            text: relativize(block.text),
        })),
        tools: document.tools.map((tool) =>
            presentTool(tool, relativize, failedChildren.get(tool.toolCallId) ?? 0)
        ),
    };
}

function presentTool(
    tool: ComputerExecutionJournalTool,
    relativize: (value: string) => string,
    failedToolCount: number
): AgentExecutionJournal['tools'][number] {
    const failure = tool.status === 'failed' ? toolFailure(tool.error) : undefined;
    const value = (input: JournalValue | undefined) => mapStrings(input, relativize);
    return {
        ...tool,
        error: value(tool.error),
        ...(failure ? { failure: { ...failure, message: relativize(failure.message) } } : {}),
        final: presentResult(tool.final, value),
        input: value(tool.input),
        output: value(tool.output),
        preliminary: presentResult(tool.preliminary, value),
        subagent: tool.subagent && {
            ...tool.subagent,
            failedToolCount,
            latestAction: tool.subagent.latestAction && relativize(tool.subagent.latestAction),
        },
    };
}

function presentResult(
    result: ComputerExecutionJournalResult | undefined,
    value: (input: JournalValue | undefined) => JournalValue | undefined
): ComputerExecutionJournalResult | undefined {
    return result && { ...result, error: value(result.error), output: value(result.output) };
}

function countFailedChildren(tools: readonly ComputerExecutionJournalTool[]) {
    const counts = new Map<string, number>();
    for (const tool of tools) {
        if (tool.parentToolCallId && tool.status === 'failed') {
            counts.set(tool.parentToolCallId, (counts.get(tool.parentToolCallId) ?? 0) + 1);
        }
    }
    return counts;
}

/** The workspace and home, each also under its resolved path (macOS `/private/var`). */
async function agentPathAliases(agentRoot: string): Promise<PathAlias[]> {
    const directories: PathAlias[] = [
        { bare: '<workspace>', prefix: '', root: join(agentRoot, 'workspace') },
        { bare: '~', prefix: '~/', root: join(agentRoot, 'home') },
    ];
    const aliases: PathAlias[] = [];
    for (const directory of directories) {
        aliases.push(directory);
        const resolved = await realpath(directory.root).catch(() => directory.root);
        if (resolved !== directory.root) {
            aliases.push({ ...directory, root: resolved });
        }
    }
    return aliases;
}

export function pathRelativizer(aliases: readonly PathAlias[]): (value: string) => string {
    const patterns = aliases.map(({ bare, prefix, root }) => ({
        bare,
        prefix,
        // The root itself, or the root followed by a path separator; never a sibling
        // such as `workspace-old`.
        pattern: new RegExp(`${escapeRegExp(root)}(/|(?![\\w.-]))`, 'gu'),
    }));
    return (value) =>
        patterns.reduce(
            (text, { bare, pattern, prefix }) =>
                text.includes('/')
                    ? text.replace(pattern, (_match, slash: string) => (slash ? prefix : bare))
                    : text,
            value
        );
}

function mapStrings(
    value: JournalValue | undefined,
    map: (value: string) => string
): JournalValue | undefined {
    if (typeof value === 'string') {
        return map(value);
    }
    if (Array.isArray(value)) {
        return value.map((item) => mapStrings(item, map) ?? null);
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, mapStrings(item, map) ?? null])
        );
    }
    return value;
}

function escapeRegExp(value: string): string {
    return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
