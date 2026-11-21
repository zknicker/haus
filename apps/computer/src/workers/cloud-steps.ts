import { computerKnownSecrets, createJournalRedactor } from '@haus/api';
import { workerStepRecorder } from './computer/step-summary.ts';

export function cloudStepRecorder(environment: Record<string, string | undefined> = process.env) {
    const recorder = workerStepRecorder(
        createJournalRedactor(computerKnownSecrets('', environment))
    );
    return {
        call: (toolCallId: string, toolName: string, input: unknown) =>
            recorder.offer({ input, toolCallId, toolName, type: 'tool-call' }),
        finish: (
            toolCallId: string,
            toolName: string,
            result: { failed: boolean; output: unknown }
        ) =>
            recorder.offer(
                result.failed
                    ? { error: result.output, toolCallId, toolName, type: 'tool-error' }
                    : { output: result.output, toolCallId, toolName, type: 'tool-result' }
            ),
        steps: recorder.steps,
    };
}
