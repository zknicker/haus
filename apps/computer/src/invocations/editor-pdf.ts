import type { FileHandle } from 'node:fs/promises';
import { composePdfTooLarge } from '@haus/agent-prompt';
import { filesystemFailure, stoppedBeforeReturn } from './files.ts';
import { type OperationContext, textResult } from './operation.ts';
import { formatSize } from './pi/truncate.ts';

const pdfByteLimit = 25 * 1024 * 1024;
const pdfMagic = [...'%PDF-'].map((character) => character.charCodeAt(0));

export function isPdf(head: Uint8Array) {
    return pdfMagic.every((byte, index) => head[index] === byte);
}

export async function viewPdf(
    path: string,
    file: { handle: FileHandle; size: number },
    context: OperationContext
) {
    if (file.size > pdfByteLimit) {
        return textResult('failed', composePdfTooLarge(formatSize(file.size)));
    }
    try {
        const read = await readPdfBytes(file.handle, pdfByteLimit, context.signal);
        if (read.kind === 'too-large') {
            return textResult('failed', composePdfTooLarge(`over ${formatSize(read.limit)}`));
        }
        const output = await context.payloads.store(read.bytes, 'application/pdf', context.signal);
        return { outcome: 'completed' as const, output, truncated: false };
    } catch (error) {
        return (
            stoppedBeforeReturn(context.signal, path) ??
            filesystemFailure(error, `Could not read file: ${path}.`)
        );
    }
}

export async function readPdfBytes(handle: FileHandle, limit: number, signal: AbortSignal) {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of handle.createReadStream({
        autoClose: false,
        end: limit,
        signal,
        start: 0,
    })) {
        chunks.push(chunk);
        total += chunk.byteLength;
    }
    if (total > limit) {
        return { kind: 'too-large', limit } as const;
    }
    return {
        bytes: chunks.length === 1 && chunks[0] ? chunks[0] : Buffer.concat(chunks, total),
        kind: 'bytes',
    } as const;
}

export function notRegularFile(path: string) {
    return textResult('failed', `${path} is not a regular file, so view cannot read it.`);
}
