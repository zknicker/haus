import type { ToolCallTurnEvent, ToolReadLocationTurnEvent } from '../runtime/turn-event.ts';

/**
 * Codex reports a file read it parsed out of a shell command as a command item whose
 * action names only the file. The Codex driver sends that file first as a
 * `tool-read-location` event and the call itself as an invalid shell call with empty
 * input, so the projector journals the step as a read of that file.
 */
export function createReadLocationSteps(workspaceDir: string | undefined) {
    const files = new Map<string, string>();
    const reads = new Set<string>();
    return {
        clear() {
            files.clear();
            reads.clear();
        },
        /** Remembers the one file a runtime read call names. */
        observeLocation(event: ToolReadLocationTurnEvent) {
            if (event.toolCallId.length === 0 || event.path.length === 0) {
                return;
            }
            files.set(event.toolCallId, workspacePath(event.path, workspaceDir));
        },
        /** The file a runtime shell call reads, when it is a read with no command. */
        claim(toolCallId: string, event: ToolCallTurnEvent): string | undefined {
            const path = files.get(toolCallId);
            if (!path || event.providerExecuted !== true || hasCommand(event.input)) {
                return;
            }
            files.delete(toolCallId);
            reads.add(toolCallId);
            return path;
        },
        journalName(toolCallId: string, toolName: string): string {
            return reads.has(toolCallId) ? 'read' : toolName;
        },
    };
}

/** Matches the runtime's own display paths, which are workspace-relative. */
function workspacePath(path: string, workspaceDir: string | undefined): string {
    const prefix = workspaceDir ? `${workspaceDir.replace(/\/+$/u, '')}/` : undefined;
    return prefix && path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function hasCommand(input: unknown): boolean {
    return isRecord(input) && typeof input.command === 'string' && input.command.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
