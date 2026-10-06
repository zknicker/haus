import type { AgentExecutionJournalTool } from '@haus/api';
import type { ToolPartState } from '@heroui-pro/react/chat-tool';
import { formatShellLabel } from './turn-trace-shell-label.ts';
import {
    formatSubagentInterruption,
    formatSubagentLabel,
    resolveSubagentStatus,
} from './turn-trace-subagent.ts';
import { readHostname, readRecord, readString, stableJson } from './turn-trace-values.ts';

export type TurnTraceToolKind =
    | 'compaction'
    | 'file-change'
    | 'file-edit'
    | 'file-read'
    | 'file-write'
    | 'generic'
    | 'mcp'
    | 'message'
    | 'search'
    | 'shell'
    | 'subagent'
    | 'web';

/** Typed fields parsed out of one journal tool's runtime-shaped input. */
interface TurnTraceToolFields {
    readonly changeEvent: string | null;
    readonly command: string | null;
    readonly connection: string | null;
    readonly content: string | null;
    readonly kind: TurnTraceToolKind;
    readonly newText: string | null;
    readonly oldText: string | null;
    readonly path: string | null;
    readonly pattern: string | null;
    readonly query: string | null;
    readonly remoteTool: string | null;
    readonly replaceAll: boolean;
    readonly url: string | null;
}

export interface TurnTraceTool extends TurnTraceToolFields {
    /** A sub-agent's own calls, in order; empty for every other kind. */
    readonly children: readonly TurnTraceTool[];
    readonly error: unknown;
    readonly interruption: string | null;
    readonly label: string;
    readonly output: unknown;
    readonly preliminary: unknown;
    readonly source: AgentExecutionJournalTool;
    readonly state: ToolPartState;
}

const blankFields = {
    changeEvent: null,
    command: null,
    connection: null,
    content: null,
    newText: null,
    oldText: null,
    path: null,
    pattern: null,
    query: null,
    remoteTool: null,
    replaceAll: false,
    url: null,
} as const;

/**
 * Wire names, lowercased. `compaction` and `filechange` are the reserved names
 * the AI SDK harness projects its own runtime events under; they carry no
 * result worth a generic dump.
 */
const toolKindsByName: Record<string, TurnTraceToolKind> = {
    bash: 'shell',
    browser: 'web',
    command: 'shell',
    compaction: 'compaction',
    filechange: 'file-change',
    edit: 'file-edit',
    exec: 'shell',
    glob: 'search',
    grep: 'search',
    message: 'message',
    multiedit: 'file-edit',
    read: 'file-read',
    send_message: 'message',
    shell: 'shell',
    terminal: 'shell',
    web_fetch: 'web',
    web_search: 'web',
    webfetch: 'web',
    websearch: 'web',
    write: 'file-write',
    zsh: 'shell',
};

const interruptionReasons: Record<string, string> = {
    computer_restart: 'the Computer restarted',
    stream_abort: 'the run was stopped',
    stream_error: 'the execution stream failed',
};

export function classifyTraceTool(
    tool: AgentExecutionJournalTool,
    children: readonly TurnTraceTool[] = []
): TurnTraceTool {
    const name = tool.toolName.trim();
    // A call is a sub-agent by what the runtime reported, never by its wire name.
    const isSubagent = tool.subagent !== undefined || children.length > 0;
    const fields: TurnTraceToolFields = isSubagent
        ? { ...blankFields, kind: 'subagent' }
        : readToolFields(name, readRecord(tool.input) ?? {});

    return {
        ...fields,
        children,
        error: resolveTraceError(tool),
        interruption:
            formatInterruption(tool) ?? (isSubagent ? formatSubagentInterruption(tool) : null),
        label: isSubagent ? formatSubagentLabel(tool) : formatTraceToolLabel(fields, name),
        output: resolveTraceOutput(tool),
        preliminary: resolveTracePreliminary(tool),
        source: tool,
        state: resolveToolPartState(tool),
    };
}

export function resolveToolPartState(tool: AgentExecutionJournalTool): ToolPartState {
    const status = resolveSubagentStatus(tool);
    if (status === 'running') {
        return 'input-available';
    }
    return status === 'completed' ? 'output-available' : 'output-error';
}

/**
 * The Computer reports the settled result twice while a known relay bug leaves
 * `output` null, so the live value wins and `final` is the fallback.
 */
export function resolveTraceOutput(tool: AgentExecutionJournalTool): unknown {
    return tool.output ?? tool.final?.output ?? undefined;
}

export function resolveTraceError(tool: AgentExecutionJournalTool): unknown {
    return tool.error ?? tool.final?.error ?? undefined;
}

/** Preliminary output only earns a place when it differs from what settled. */
export function resolveTracePreliminary(tool: AgentExecutionJournalTool): unknown {
    const preliminary = tool.preliminary?.output;
    if (preliminary === undefined) {
        return undefined;
    }
    return stableJson(preliminary) === stableJson(resolveTraceOutput(tool))
        ? undefined
        : preliminary;
}

export function formatInterruption(tool: AgentExecutionJournalTool): string | null {
    const interruption = tool.interruptions?.at(-1);
    if (!interruption) {
        return null;
    }
    return `Interrupted because ${interruptionReasons[interruption.reason] ?? 'the run ended'}.`;
}

function readToolFields(name: string, input: Record<string, unknown>): TurnTraceToolFields {
    const kind = readToolKind(name.toLowerCase());

    switch (kind) {
        case 'file-change':
            return {
                ...blankFields,
                changeEvent: readString(input.event),
                kind,
                path: readFilePath(input),
            };
        case 'file-edit':
            return {
                ...blankFields,
                kind,
                newText: readString(input.new_string),
                oldText: readString(input.old_string),
                path: readFilePath(input),
                replaceAll: input.replace_all === true,
            };
        case 'file-read':
            return { ...blankFields, kind, path: readFilePath(input) };
        case 'file-write':
            return {
                ...blankFields,
                content: readString(input.content),
                kind,
                path: readFilePath(input),
            };
        case 'mcp':
            return { ...blankFields, kind, ...readMcpName(name) };
        case 'search':
            return {
                ...blankFields,
                kind,
                path: readFilePath(input),
                pattern: readString(input.pattern) ?? readString(input.glob),
            };
        case 'shell':
            return {
                ...blankFields,
                command: readString(input.command) ?? readString(input.cmd),
                kind,
            };
        case 'web':
            return {
                ...blankFields,
                kind,
                query: readString(input.query),
                url: readString(input.url),
            };
        default:
            return { ...blankFields, kind };
    }
}

function readToolKind(normalized: string): TurnTraceToolKind {
    if (normalized.startsWith('mcp__')) {
        return 'mcp';
    }
    return toolKindsByName[normalized] ?? 'generic';
}

/** `mcp__<connection>__<tool>_<hash>` — the trailing hex hash is noise here. */
function readMcpName(name: string): { connection: string | null; remoteTool: string | null } {
    const [connection, ...rest] = name.slice('mcp__'.length).split('__');
    const remoteTool = rest.join('__').replace(/_[0-9a-f]{6,}$/i, '');
    return {
        connection: connection && connection.length > 0 ? connection : null,
        remoteTool: remoteTool.length > 0 ? remoteTool : null,
    };
}

const fileChangeVerbs: Record<string, string> = {
    create: 'Created',
    delete: 'Deleted',
    modify: 'Modified',
};

function formatTraceToolLabel(fields: TurnTraceToolFields, name: string): string {
    switch (fields.kind) {
        case 'compaction':
            return 'Compacted the context';
        case 'file-change':
            return formatFileChangeLabel(fields);
        case 'file-edit':
            return fields.path ? `Edited ${fields.path}` : 'Edited a file';
        case 'file-read':
            return fields.path ? `Read ${fields.path}` : 'Read a file';
        case 'file-write':
            return fields.path ? `Wrote ${fields.path}` : 'Wrote a file';
        case 'mcp':
            return `Called ${[fields.connection, fields.remoteTool].filter(Boolean).join(' · ')}`;
        case 'message':
            return 'Sent a message';
        case 'search':
            return `Searched ${fields.pattern ?? fields.path ?? 'the workspace'}`;
        case 'shell':
            return fields.command ? formatShellLabel(fields.command) : 'Ran a command';
        case 'web':
            return formatWebLabel(fields);
        default:
            return `Used ${name}`;
    }
}

function formatFileChangeLabel(fields: TurnTraceToolFields): string {
    const verb = fileChangeVerbs[fields.changeEvent ?? ''] ?? 'Changed';
    return fields.path ? `${verb} ${fields.path}` : `${verb} a file`;
}

function formatWebLabel(fields: TurnTraceToolFields): string {
    if (fields.url) {
        return `Fetched ${readHostname(fields.url)}`;
    }
    return fields.query ? `Searched the web for ${fields.query}` : 'Used the web';
}

function readFilePath(input: Record<string, unknown>): string | null {
    return readString(input.file_path) ?? readString(input.path) ?? readString(input.filePath);
}
