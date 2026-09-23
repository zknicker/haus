import type { ComputerAgentActivityCategory } from '../agent-activity.ts';

/**
 * Fixture-shaped tool identities kept explicit so adapter renames fail closed.
 *
 * Keys are the names that reach the wire: each adapter's common tool name
 * (`bash`, `write`, …) plus the native name of any builtin it declares without
 * a common alias (`ls`, `WebFetch`, `read_file`).
 */
export const computerNativeToolActivityFixtures = {
    'claude-code': {
        Bash: 'running_command',
        Edit: 'editing_files',
        Glob: 'reading_files',
        Grep: 'reading_files',
        Read: 'reading_files',
        Write: 'editing_files',
        WebFetch: 'browsing',
        WebSearch: 'searching_web',
        bash: 'running_command',
        edit: 'editing_files',
        glob: 'reading_files',
        grep: 'reading_files',
        read: 'reading_files',
        webSearch: 'searching_web',
        write: 'editing_files',
    },
    codex: {
        apply_patch: 'editing_files',
        bash: 'running_command',
        webSearch: 'searching_web',
    },
    'grok-build': {
        bash: 'running_command',
        edit: 'editing_files',
        grep: 'reading_files',
        list_dir: 'reading_files',
        read_file: 'reading_files',
        webSearch: 'searching_web',
        write: 'editing_files',
    },
    pi: {
        bash: 'running_command',
        edit: 'editing_files',
        glob: 'reading_files',
        grep: 'reading_files',
        ls: 'reading_files',
        read: 'reading_files',
        write: 'editing_files',
    },
} as const satisfies Record<string, Readonly<Record<string, ComputerAgentActivityCategory>>>;

/**
 * The AI SDK harness projects runtime events that have no first-class stream
 * part as synthetic `dynamic: true, providerExecuted: true` tool-call/result
 * pairs under reserved names (@ai-sdk/harness 1.0.78
 * `src/agent/internal/translate-stream-part.ts:160-244`). `fileChange` is the
 * only file-edit evidence some runtimes emit; `compaction` is context
 * bookkeeping the journal keeps but Activity must stay silent about.
 */
export const computerSyntheticHarnessToolFixtures = {
    compaction: 'skip',
    fileChange: 'editing_files',
} as const satisfies Readonly<Record<string, ComputerAgentActivityCategory | 'skip'>>;

export function syntheticHarnessToolActivity(
    toolName: string,
    providerExecuted: boolean
): ComputerAgentActivityCategory | 'skip' | undefined {
    // Host and MCP tools are the ones run-prompt dispatches, and it dispatches
    // only calls that are not provider-executed (@ai-sdk/harness 1.0.78
    // `src/agent/internal/run-prompt.ts:859`), so this flag keeps a same-named
    // third-party tool on the generic path.
    if (!providerExecuted) {
        return undefined;
    }
    return computerSyntheticHarnessToolFixtures[
        toolName as keyof typeof computerSyntheticHarnessToolFixtures
    ];
}

export function knownToolCategory(
    runtimeId: string,
    toolName: string,
    nativeName?: string
): ComputerAgentActivityCategory | undefined {
    const mapping: Readonly<Record<string, ComputerAgentActivityCategory>> | undefined =
        computerNativeToolActivityFixtures[
            runtimeId as keyof typeof computerNativeToolActivityFixtures
        ];
    return mapping?.[nativeName ?? toolName] ?? mapping?.[toolName];
}
