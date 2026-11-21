import { cloudStepRecorder } from '../cloud-steps.ts';
import type { ClaudeLogEntry } from './session-events.ts';

export function claudeSteps(entries: readonly ClaudeLogEntry[]) {
    const recorder = cloudStepRecorder();
    const names = new Map<string, string>();
    for (const entry of entries) {
        if (entry.kind === 'tool-use') {
            names.set(entry.id, entry.name);
            recorder.call(entry.id, entry.name, entry.input);
        } else if (entry.kind === 'tool-result') {
            recorder.finish(entry.toolUseId, names.get(entry.toolUseId) ?? 'unknown', {
                failed: entry.isError,
                output: entry.output,
            });
        }
    }
    const steps = recorder.steps();
    return steps.length > 0 ? { steps } : {};
}
