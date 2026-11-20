import { readFile, stat } from 'node:fs/promises';
import { composePdfTooLarge } from '@haus/agent-prompt';
import { filesystemFailure, stoppedBeforeReturn } from './files.ts';
import { type OperationContext, textResult } from './operation.ts';
import { formatSize } from './pi/truncate.ts';

const pdfByteLimit = 5 * 1024 * 1024;
const pdfMagic = [...'%PDF-'].map((character) => character.charCodeAt(0));

export function isPdf(head: Uint8Array) {
    return pdfMagic.every((byte, index) => head[index] === byte);
}

export async function viewPdf(path: string, absolutePath: string, context: OperationContext) {
    try {
        const { size } = await stat(absolutePath);
        if (size > pdfByteLimit) {
            return textResult('failed', composePdfTooLarge(formatSize(size)));
        }
        const output = await context.payloads.store(
            await readFile(absolutePath),
            'application/pdf',
            context.signal
        );
        return { outcome: 'completed' as const, output, truncated: false };
    } catch (error) {
        return (
            stoppedBeforeReturn(context.signal, path) ??
            filesystemFailure(error, `Could not read file: ${path}.`)
        );
    }
}
