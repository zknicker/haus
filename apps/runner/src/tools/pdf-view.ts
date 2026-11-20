import { composePdfText, composePdfUnreadable } from '@haus/agent-prompt';
import type { EditorCommand } from '@haus/api';
import { viewText } from '@haus/computer/src/invocations/editor-view.ts';
import { extractText, getDocumentProxy } from 'unpdf';
import { type InvocationAnswer, invocationToolOutcome } from '../invocations/invocation-client.ts';
import type { ToolOutcome } from '../run-context.ts';

export async function editOutcome(answer: InvocationAnswer, command: EditorCommand) {
    const { frame } = answer;
    const { output } = frame;
    if (
        !(
            command.command === 'view' &&
            frame.outcome === 'completed' &&
            output.kind === 'inline' &&
            output.mediaType === 'application/pdf'
        )
    ) {
        return invocationToolOutcome(answer);
    }
    const pages = await pdfPages(Buffer.from(output.base64, 'base64'));
    const view =
        pages.kind === 'read' ? viewText(command, composePdfText(pages.text)) : pages.refusal;
    return {
        content: [{ text: view.output.text, type: 'text' }],
        invocation: frame.outcome,
        isError: view.outcome !== 'completed',
    } satisfies ToolOutcome;
}

async function pdfPages(bytes: Uint8Array) {
    try {
        const document = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 });
        try {
            const { text } = await extractText(document, { mergePages: false });
            return { kind: 'read' as const, text };
        } finally {
            await document.loadingTask.destroy();
        }
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return {
            kind: 'unreadable' as const,
            refusal: {
                outcome: 'failed' as const,
                output: { kind: 'text' as const, text: composePdfUnreadable(reason) },
            },
        };
    }
}
