import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { MachineInvocationOutcome } from '@haus/api';
import { formatSize } from '@haus/api/truncate';
import {
    type OperationContext,
    type OperationRunner,
    stoppedOutcome,
    textResult,
} from './operation.ts';
import { resolveMachinePath, resolveReadPath } from './paths.ts';

const imageByteLimit = 5 * 1024 * 1024;

export const viewImageRunner: OperationRunner<'view-image'> = (operation, context) =>
    viewImage(operation.path, context);

export const fileReadRunner: OperationRunner<'file-read'> = async (operation, context) => {
    const absolutePath = await resolveReadPath(operation.path, context);
    try {
        const { size } = await stat(absolutePath);
        if (size > operation.maxBytes) {
            return tooLarge(operation.path, size, operation.maxBytes);
        }
        const bytes = await readFile(absolutePath);
        if (bytes.byteLength > operation.maxBytes) {
            return tooLarge(operation.path, bytes.byteLength, operation.maxBytes);
        }
        const output = await context.payloads.store(
            bytes,
            imageMediaType(bytes) ?? 'application/octet-stream',
            context.signal
        );
        return { outcome: 'completed' as const, output, truncated: false };
    } catch (error) {
        return (
            stoppedBeforeReturn(context.signal, operation.path) ??
            filesystemFailure(error, `Could not read file: ${operation.path}.`)
        );
    }
};

export const fileWriteRunner: OperationRunner<'file-write'> = async (operation, context) => {
    let bytes: Uint8Array;
    try {
        bytes = await context.payloads.fetch(operation.bytes, context.signal);
    } catch (error) {
        const stopped = stoppedOutcome(context.signal);
        if (stopped) {
            return stoppedBeforeWrite(stopped, operation.path);
        }
        const reason = error instanceof Error ? error.message : String(error);
        return textResult(
            'failed',
            `Could not fetch the bytes for ${operation.path}: ${reason} Nothing was written.`
        );
    }
    try {
        const absolutePath = resolveMachinePath(operation.path, context);
        const stopped = await writeFileAtomically(
            absolutePath,
            bytes,
            context.signal,
            operation.mode
        );
        if (stopped) {
            return stoppedBeforeWrite(stopped, operation.path);
        }
    } catch (error) {
        return filesystemFailure(error, `Could not write file: ${operation.path}.`);
    }
    return textResult('completed', `Wrote ${bytes.byteLength} bytes to ${operation.path}.`);
};

export async function viewImage(path: string, context: OperationContext) {
    const absolutePath = await resolveReadPath(path, context);
    try {
        const { size } = await stat(absolutePath);
        return await storeImage(path, { read: () => readFile(absolutePath), size }, context);
    } catch (error) {
        return (
            stoppedBeforeReturn(context.signal, path) ??
            filesystemFailure(error, `Could not read file: ${path}.`)
        );
    }
}

export async function storeImage(
    path: string,
    file: { read: () => Promise<Uint8Array>; size: number },
    context: OperationContext
) {
    if (file.size > imageByteLimit) {
        return textResult('failed', `Image is ${formatSize(file.size)}; the limit is 5 MiB.`);
    }
    const bytes = await file.read();
    const mediaType = imageMediaType(bytes);
    if (!mediaType) {
        return textResult('failed', `${path} is not a PNG, JPEG, GIF, or WebP image.`);
    }
    const output = await context.payloads.store(bytes, mediaType, context.signal);
    return { outcome: 'completed' as const, output, truncated: false };
}

export function imageMediaType(bytes: Uint8Array) {
    if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
        return 'image/png';
    }
    if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
        return 'image/jpeg';
    }
    if (startsWith(bytes, ascii('GIF87a')) || startsWith(bytes, ascii('GIF89a'))) {
        return 'image/gif';
    }
    if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes.subarray(8), ascii('WEBP'))) {
        return 'image/webp';
    }
    return null;
}

export async function writeFileAtomically(
    path: string,
    content: string | Uint8Array,
    signal: AbortSignal,
    mode?: number
) {
    const existing = await existingFile(path);
    const target = existing?.path ?? path;
    const temporary = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
    await mkdir(dirname(target), { recursive: true });
    try {
        await writeFile(temporary, content);
        const finalMode = mode ?? existing?.mode;
        if (finalMode !== undefined) {
            await chmod(temporary, finalMode);
        }
        const stopped = stoppedOutcome(signal);
        if (stopped) {
            await rm(temporary, { force: true });
            return stopped;
        }
        await rename(temporary, target);
        return null;
    } catch (error) {
        await rm(temporary, { force: true });
        throw error;
    }
}

export async function existingFile(path: string) {
    try {
        const target = await realpath(path);
        return { mode: (await stat(target)).mode & 0o7777, path: target };
    } catch (error) {
        if (errorCode(error) === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

export function stoppedBeforeWrite(
    outcome: Exclude<MachineInvocationOutcome, 'unknown'>,
    path: string
) {
    return textResult(outcome, `Stopped before writing ${path}. Nothing was written.`);
}

export function filesystemFailure(error: unknown, message: string) {
    const code = errorCode(error);
    if (!code) {
        throw error;
    }
    return textResult('failed', `${message} Error code: ${code}.`);
}

function errorCode(error: unknown) {
    return error instanceof Error && 'code' in error && typeof error.code === 'string'
        ? error.code
        : null;
}

export function stoppedBeforeReturn(signal: AbortSignal, path: string) {
    const stopped = stoppedOutcome(signal);
    return stopped ? textResult(stopped, `Stopped before returning ${path}.`) : null;
}

function tooLarge(path: string, sizeBytes: number, maxBytes: number) {
    return textResult('failed', `${path} is ${sizeBytes} bytes; the limit is ${maxBytes} bytes.`);
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]) {
    return prefix.every((byte, index) => bytes[index] === byte);
}

function ascii(text: string) {
    return [...text].map((character) => character.charCodeAt(0));
}
