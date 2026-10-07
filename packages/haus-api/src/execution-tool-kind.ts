import * as z from 'zod';

/**
 * What one execution-journal tool call was, read from its wire name: the one
 * classifier both the App's turn trace and the Computer's execution outline
 * use, so a call colors the same whether its turn was read in full or only
 * outlined. A sub-agent is known by what the runtime reported, never by name,
 * so callers set `subagent` themselves.
 */
export const executionToolKindSchema = z.enum([
    'compaction',
    'file-change',
    'file-edit',
    'file-read',
    'file-write',
    'generic',
    'image',
    'mcp',
    'message',
    'search',
    'shell',
    'subagent',
    'web',
]);

export type ExecutionToolKind = z.infer<typeof executionToolKindSchema>;

/** A journal tool's kind from its wire name (`toolName`), case- and padding-insensitive. */
export function readExecutionToolKind(toolName: string): ExecutionToolKind {
    const normalized = toolName.trim().toLowerCase();
    if (normalized.startsWith('mcp__')) {
        return 'mcp';
    }
    return Object.hasOwn(toolKindsByName, normalized)
        ? (toolKindsByName[normalized] as ExecutionToolKind)
        : 'generic';
}

/**
 * Wire names, lowercased. `compaction` and `filechange` are the reserved names
 * the AI SDK harness projects its own runtime events under.
 */
const toolKindsByName: Readonly<Record<string, ExecutionToolKind>> = {
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
