/**
 * Claude Code builtins under the common names Activity, the journal, and thoughts already key on
 * (`activity-tool-fixtures.ts`): the names the AI SDK harness reported. Others keep their
 * native name.
 */
const nativeToCommon: Readonly<Record<string, string>> = {
    AskUserQuestion: 'askUserQuestions',
    Bash: 'bash',
    Edit: 'edit',
    Glob: 'glob',
    Grep: 'grep',
    Read: 'read',
    WebSearch: 'webSearch',
    Write: 'write',
};

export interface ClaudeToolName {
    /** An MCP tool from a server other than Haus's (strict MCP config admits none). */
    readonly dynamic: boolean;
    readonly nativeName: string;
    /** A runtime builtin, not a Haus host tool. */
    readonly providerExecuted: boolean;
    readonly toolName: string;
}

/**
 * Maps a `tool_use` name to the turn-event identity. Haus host tools arrive as
 * `mcp__<server>__<tool>` and leave as the bare host-tool name, without `providerExecuted`.
 */
export function claudeToolName(nativeName: string, hostServer: string): ClaudeToolName {
    const hostPrefix = `mcp__${hostServer}__`;
    if (nativeName.startsWith(hostPrefix)) {
        return {
            dynamic: false,
            nativeName,
            providerExecuted: false,
            toolName: nativeName.slice(hostPrefix.length),
        };
    }
    return {
        dynamic: nativeName.startsWith('mcp__'),
        nativeName,
        providerExecuted: true,
        toolName: nativeToCommon[nativeName] ?? nativeName,
    };
}

const workspaceToken = '<workspace>';
const before = '(^|[\\s"\'`=])';
const terminator = '[\\s"\'`;|&<>()]';

/**
 * Makes absolute workspace paths workspace-relative in a tool's input or output, as the AI SDK
 * harness did for every tool part: `<ws>/src/a.ts` becomes `src/a.ts`, and a bare `<ws>`
 * becomes `<workspace>`. Only path-shaped references are rewritten.
 */
export function createWorkspaceStripper(workspaceDirs: readonly string[]) {
    const patterns = [...new Set(workspaceDirs)]
        .filter((dir) => dir.length > 1)
        .sort((left, right) => right.length - left.length)
        .map(
            (dir) =>
                new RegExp(
                    `${before}${escapeRegExp(dir)}(?:(/)|(?=$|${terminator}|\\.(?:$|${terminator})))`,
                    'gu'
                )
        );
    const stripString = (value: string): string =>
        patterns.reduce(
            (text, pattern) =>
                text.replace(pattern, (_match, prefix: string, slash: string | undefined) =>
                    slash ? prefix : `${prefix}${workspaceToken}`
                ),
            value
        );
    const stripDeep = (value: unknown, depth = 0): unknown => {
        if (typeof value === 'string') {
            return stripString(value);
        }
        if (depth > 32 || value === null || typeof value !== 'object') {
            return value;
        }
        if (Array.isArray(value)) {
            return value.map((item) => stripDeep(item, depth + 1));
        }
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, stripDeep(item, depth + 1)])
        );
    };
    return stripDeep;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
