/**
 * codex-acp sends a file read Codex parsed out of a shell command as an ACP
 * `read` tool call named `exec_command` that carries no command, only the file
 * in `locations`. harness-acp streams that call as an invalid shell call with
 * empty input, so the projector learns the file from the raw ACP update that
 * precedes it and journals the step as a read of that file.
 */
export function createAcpReadSteps(workspaceDir: string | undefined) {
    const files = new Map<string, string>();
    const reads = new Set<string>();
    return {
        clear() {
            files.clear();
            reads.clear();
        },
        /** Remembers the one file a raw ACP `read` tool call names. */
        observeRaw(part: Record<string, unknown>) {
            const update = isRecord(part.rawValue) ? part.rawValue : undefined;
            const locations = Array.isArray(update?.locations) ? update.locations : [];
            const [location] = locations;
            if (
                update?.sessionUpdate !== 'tool_call' ||
                update.kind !== 'read' ||
                typeof update.toolCallId !== 'string' ||
                locations.length !== 1 ||
                !isRecord(location) ||
                typeof location.path !== 'string' ||
                location.path.length === 0
            ) {
                return;
            }
            files.set(update.toolCallId, workspacePath(location.path, workspaceDir));
        },
        /** The file a runtime shell call reads, when it is a read with no command. */
        claim(toolCallId: string, part: Record<string, unknown>): string | undefined {
            const path = files.get(toolCallId);
            if (!path || part.providerExecuted !== true || hasCommand(part.input)) {
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

/** Matches the harness's own display paths, which are workspace-relative. */
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
