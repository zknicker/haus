import { unwrapShell } from '../../harness/haus-cli-command.ts';
import { compactionToolName, type TurnEvent } from '../turn-event.ts';
import type { CodexItem } from './protocol.ts';

export interface ToolItemContext {
    /** The host-tool MCP server's name; its calls are Haus host tools, not builtins. */
    readonly hostToolServer: string;
    readonly workspaceDir: string;
}

/**
 * Codex builtins under the names Activity already reads for Codex (`codexBuiltinTools`):
 * `bash` (native `exec_command`), `apply_patch` plus one synthetic `fileChange` per file,
 * `webSearch` (native `web_search`), `image_gen`, and the silent `compaction`.
 */
export function toolItemStarted(item: CodexItem, context: ToolItemContext): TurnEvent[] | null {
    const id = item.id ?? '';
    switch (item.type) {
        case 'commandExecution':
            return commandStarted(item, id);
        case 'fileChange':
            return [
                { ...builtin(id, 'apply_patch'), input: {}, type: 'tool-call' },
                ...fileChanges(item, context).map(
                    (input, index): TurnEvent => ({
                        ...builtin(fileChangeId(id, index), 'fileChange'),
                        dynamic: true,
                        input,
                        sourceToolCallId: id,
                        type: 'tool-call',
                    })
                ),
            ];
        case 'mcpToolCall':
            return [
                { ...mcpFacts(item, id, context), input: item.arguments ?? {}, type: 'tool-call' },
            ];
        case 'dynamicToolCall':
            return [{ ...dynamicFacts(item, id), input: item.arguments ?? {}, type: 'tool-call' }];
        case 'webSearch':
            return [
                { ...webSearch(id), input: { query: webSearchQuery(item) }, type: 'tool-call' },
            ];
        case 'imageGeneration':
            return [{ ...builtin(id, 'image_gen'), input: { id }, type: 'tool-call' }];
        case 'contextCompaction':
            return [
                { ...builtin(id, compactionToolName), dynamic: true, input: {}, type: 'tool-call' },
            ];
        case 'collabAgentToolCall':
            return [
                {
                    ...builtin(id, 'collab_agent'),
                    input: { prompt: item.prompt, tool: item.tool },
                    type: 'tool-call',
                },
            ];
        default:
            return null;
    }
}

export function toolItemCompleted(item: CodexItem, context: ToolItemContext): TurnEvent[] | null {
    const id = item.id ?? '';
    const failed = item.status === 'failed' || item.status === 'declined';
    switch (item.type) {
        case 'commandExecution':
            return [
                result(
                    shell(id),
                    {
                        exit_code: item.exitCode ?? null,
                        formatted_output: item.aggregatedOutput ?? '',
                    },
                    failed
                ),
            ];
        case 'fileChange':
            return [
                ...fileChanges(item, context).map((input, index) =>
                    result(
                        { ...builtin(fileChangeId(id, index), 'fileChange'), dynamic: true },
                        { ...input, status: item.status },
                        failed
                    )
                ),
                result(builtin(id, 'apply_patch'), { status: item.status }, failed),
            ];
        case 'mcpToolCall':
            return item.error
                ? [{ ...mcpFacts(item, id, context), error: item.error, type: 'tool-error' }]
                : [result(mcpFacts(item, id, context), item.result ?? null, failed)];
        case 'dynamicToolCall':
            return [
                result(dynamicFacts(item, id), item.contentItems ?? null, item.success === false),
            ];
        case 'webSearch':
            return [
                result(
                    webSearch(id),
                    { action: item.action ?? null, query: webSearchQuery(item) },
                    false
                ),
            ];
        case 'imageGeneration':
            return [imageResult(item, id)];
        case 'contextCompaction':
            return [result({ ...builtin(id, compactionToolName), dynamic: true }, {}, false)];
        case 'collabAgentToolCall':
            return [result(builtin(id, 'collab_agent'), { status: item.status }, failed)];
        default:
            return null;
    }
}

/** The journal keeps a generated image's saved path, never its inlined base64. */
function imageResult(item: CodexItem, id: string): TurnEvent {
    if (item.failure) {
        return { ...builtin(id, 'image_gen'), error: item.failure, type: 'tool-error' };
    }
    return result(
        builtin(id, 'image_gen'),
        {
            revisedPrompt: item.revisedPrompt ?? null,
            savedPath: item.savedPath ?? null,
            status: item.status,
        },
        false
    );
}

function result(
    facts: {
        dynamic?: boolean;
        nativeName?: string;
        providerExecuted?: boolean;
        toolCallId: string;
        toolName: string;
    },
    output: unknown,
    isError: boolean
): TurnEvent {
    return { ...facts, output, type: 'tool-result', ...(isError ? { isError: true } : {}) };
}

/**
 * A command Codex parsed as one file read is that read, reported first as its location with an
 * input-less shell call, exactly as codex-acp sent it, so the projector journals a read.
 */
function commandStarted(item: CodexItem, id: string): TurnEvent[] {
    const actions = Array.isArray(item.commandActions) ? item.commandActions : [];
    const [action] = actions;
    if (
        actions.length === 1 &&
        isRecord(action) &&
        action.type === 'read' &&
        nonEmpty(action.path)
    ) {
        return [
            { path: action.path, toolCallId: id, type: 'tool-read-location' },
            { ...shell(id), input: {}, invalid: true, type: 'tool-call' },
        ];
    }
    return [
        {
            ...shell(id),
            input: { command: modelCommand(item.command), cwd: item.cwd },
            type: 'tool-call',
        },
    ];
}

/**
 * The command the model wrote. App-server reports the shell-joined argv Codex ran
 * (`/bin/zsh -lc "haus … --target \"#x\" …"`); codex-acp reported the script inside it, and
 * journals, Activity, and `--done` evidence read that script.
 */
function modelCommand(command: unknown): unknown {
    return typeof command === 'string' ? unwrapShell(command) : command;
}

function fileChanges(item: CodexItem, context: ToolItemContext) {
    const changes = Array.isArray(item.changes) ? item.changes : [];
    return changes.filter(isRecord).map((change) => ({
        event: changeEvent(change.kind),
        path: workspacePath(String(change.path ?? ''), context.workspaceDir),
    }));
}

function changeEvent(kind: unknown): 'create' | 'delete' | 'modify' {
    const type = isRecord(kind) ? kind.type : kind;
    if (type === 'add') {
        return 'create';
    }
    return type === 'delete' ? 'delete' : 'modify';
}

function mcpFacts(item: CodexItem, id: string, context: ToolItemContext) {
    const server = String(item.server ?? '');
    const tool = String(item.tool ?? '');
    return server === context.hostToolServer
        ? { toolCallId: id, toolName: tool }
        : { dynamic: true, toolCallId: id, toolName: `mcp__${server}__${tool}` };
}

function dynamicFacts(item: CodexItem, id: string) {
    return { dynamic: true, toolCallId: id, toolName: String(item.tool ?? 'dynamic_tool') };
}

function webSearchQuery(item: CodexItem): string {
    if (nonEmpty(item.query)) {
        return item.query;
    }
    const action = isRecord(item.action) ? item.action : {};
    return nonEmpty(action.query) ? action.query : '';
}

function shell(id: string) {
    return { nativeName: 'exec_command', providerExecuted: true, toolCallId: id, toolName: 'bash' };
}

function webSearch(id: string) {
    return {
        nativeName: 'web_search',
        providerExecuted: true,
        toolCallId: id,
        toolName: 'webSearch',
    };
}

function builtin(id: string, toolName: string) {
    return { providerExecuted: true, toolCallId: id, toolName };
}

function fileChangeId(id: string, index: number): string {
    return `${id}:file:${index}`;
}

/** Workspace paths read relative, as codex-acp showed them; anything outside stays whole. */
function workspacePath(path: string, workspaceDir: string): string {
    const prefix = `${workspaceDir.replace(/\/+$/u, '')}/`;
    return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function nonEmpty(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
