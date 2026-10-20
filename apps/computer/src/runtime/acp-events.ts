import type { ToolReadLocationTurnEvent } from './turn-event.ts';

/**
 * The one file an ACP `read` tool call names in `locations`, from a raw ACP `session/update`.
 * codex-acp sends a read Codex parsed out of a shell command this way, with no command.
 */
export function acpReadLocationEvent(update: unknown): ToolReadLocationTurnEvent | null {
    if (!isRecord(update)) {
        return null;
    }
    const locations = Array.isArray(update.locations) ? update.locations : [];
    const [location] = locations;
    if (
        update.sessionUpdate !== 'tool_call' ||
        update.kind !== 'read' ||
        typeof update.toolCallId !== 'string' ||
        locations.length !== 1 ||
        !isRecord(location) ||
        typeof location.path !== 'string' ||
        location.path.length === 0
    ) {
        return null;
    }
    return { path: location.path, toolCallId: update.toolCallId, type: 'tool-read-location' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
