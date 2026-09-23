import type { ComputerExecutionJournal } from './execution-journal.ts';

/**
 * An ACP runtime's own edit call (codex-acp's `apply_patch`) and the harness's
 * synthetic `fileChange` for the same edit describe one edit. harness-acp tags
 * that `fileChange` with the ACP tool call it came from, so the projector folds
 * it into its source call instead of counting the edit twice: the source keeps
 * the edit's one Activity, and a source step with no input of its own (Codex's
 * patch) takes the first file's name. A patch's further files keep journal steps
 * of their own, without Activity.
 */
export function createFileChangeFold(skippedActivity: Set<string>) {
    const seen = new Map<string, { bare: boolean; toolName: string }>();
    const folded = new Set<string>();
    const renamed = new Set<string>();
    const absorbed = new Set<string>();
    return {
        /** Drops the result of a file change already folded into its source. */
        absorbsResult(toolCallId: string): boolean {
            return absorbed.delete(toolCallId);
        },
        clear() {
            seen.clear();
            folded.clear();
            renamed.clear();
            absorbed.clear();
        },
        journalName(toolCallId: string, toolName: string): string {
            return renamed.has(toolCallId) ? 'fileChange' : toolName;
        },
        /** Journals a sourced file change itself and reports that it did; it opens no Activity. */
        async observeCall(
            call: { part: Record<string, unknown>; toolCallId: string; toolName: string },
            journal: ComputerExecutionJournal | undefined
        ): Promise<boolean> {
            const sourceId = fileChangeSourceId(call.part);
            const source = sourceId ? seen.get(sourceId) : undefined;
            if (!(sourceId && source)) {
                seen.set(call.toolCallId, {
                    bare: isBare(call.part.input),
                    toolName: call.toolName,
                });
                return false;
            }
            if (folded.has(sourceId)) {
                // A further file: its own step, whose result stays out of Activity.
                skippedActivity.add(call.toolCallId);
                await journal?.recordToolCall({
                    input: call.part.input,
                    toolCallId: call.toolCallId,
                    toolName: call.toolName,
                });
                return true;
            }
            folded.add(sourceId);
            absorbed.add(call.toolCallId);
            if (source.bare) {
                renamed.add(sourceId);
                await journal?.recordToolCall({
                    input: call.part.input,
                    nativeName: source.toolName,
                    toolCallId: sourceId,
                    toolName: call.toolName,
                });
            }
            return true;
        },
    };
}

function fileChangeSourceId(part: Record<string, unknown>): string | undefined {
    if (part.toolName !== 'fileChange' || part.providerExecuted !== true) {
        return;
    }
    const acp = isRecord(part.providerMetadata) ? part.providerMetadata.acp : undefined;
    const toolCallId = isRecord(acp) ? acp.toolCallId : undefined;
    return typeof toolCallId === 'string' && toolCallId.length > 0 ? toolCallId : undefined;
}

/** codex-acp sends a patch call with no raw input, which harness-acp streams as `{}`. */
function isBare(input: unknown): boolean {
    if (typeof input === 'string') {
        return input.trim() === '' || input.trim() === '{}';
    }
    return input == null || (isRecord(input) && Object.keys(input).length === 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
