import { readString } from './turn-trace-values.ts';

export type TurnTraceToolKind =
    | 'compaction'
    | 'file-change'
    | 'file-edit'
    | 'file-read'
    | 'file-write'
    | 'generic'
    | 'image'
    | 'mcp'
    | 'message'
    | 'search'
    | 'shell'
    | 'subagent'
    | 'web';

/** Typed fields parsed out of one journal tool's runtime-shaped input. */
export interface TurnTraceToolFields {
    readonly changeEvent: string | null;
    readonly command: string | null;
    readonly connection: string | null;
    readonly content: string | null;
    /** A generic call's argument names, for a label that says more than "Used x". */
    readonly inputKeys: readonly string[];
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

export const blankToolFields = {
    changeEvent: null,
    command: null,
    connection: null,
    content: null,
    inputKeys: [],
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
    // Codex and Grok Build native media tools (Computer `generated-images.ts`).
    image_edit: 'image',
    image_gen: 'image',
    image_to_video: 'image',
    message: 'message',
    multiedit: 'file-edit',
    read: 'file-read',
    reference_to_video: 'image',
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

export function readToolFields(name: string, input: Record<string, unknown>): TurnTraceToolFields {
    const kind = readToolKind(name.toLowerCase());

    switch (kind) {
        case 'file-change':
            return {
                ...blankToolFields,
                changeEvent: readString(input.event),
                kind,
                path: readFilePath(input),
            };
        case 'file-edit':
            return {
                ...blankToolFields,
                kind,
                newText: readString(input.new_string),
                oldText: readString(input.old_string),
                path: readFilePath(input),
                replaceAll: input.replace_all === true,
            };
        case 'file-read':
            return { ...blankToolFields, kind, path: readFilePath(input) };
        case 'file-write':
            return {
                ...blankToolFields,
                content: readString(input.content),
                kind,
                path: readFilePath(input),
            };
        case 'mcp':
            return { ...blankToolFields, kind, ...readMcpName(name) };
        case 'search':
            return {
                ...blankToolFields,
                kind,
                path: readFilePath(input),
                pattern: readString(input.pattern) ?? readString(input.glob),
            };
        case 'shell':
            return {
                ...blankToolFields,
                command: readString(input.command) ?? readString(input.cmd),
                kind,
            };
        case 'web':
            return {
                ...blankToolFields,
                kind,
                query: readString(input.query),
                url: readString(input.url) ?? readArgsUrl(input.args),
            };
        default:
            return { ...blankToolFields, inputKeys: Object.keys(input).slice(0, 3), kind };
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

function readFilePath(input: Record<string, unknown>): string | null {
    return readString(input.file_path) ?? readString(input.path) ?? readString(input.filePath);
}

/** Codex's `browser` tool takes an argv (`["tab", "new", "https://…"]`). */
function readArgsUrl(args: unknown): string | null {
    if (!Array.isArray(args)) {
        return null;
    }
    const url = args.find((entry) => typeof entry === 'string' && /^https?:\/\//u.test(entry));
    return typeof url === 'string' ? url : null;
}
