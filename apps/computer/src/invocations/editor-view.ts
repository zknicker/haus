import { constants, type Dirent } from 'node:fs';
import { type FileHandle, open, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { EditorCommand } from '@haus/api';
import { DEFAULT_MAX_BYTES, formatSize, truncateHead } from '@haus/api/truncate';
import { isPdf, notRegularFile, viewPdf } from './editor-pdf.ts';
import { filesystemFailure, imageMediaType, stoppedBeforeReturn, storeImage } from './files.ts';
import { type OperationContext, textResult } from './operation.ts';
import { resolveReadPath } from './paths.ts';

type ViewCommand = Extract<EditorCommand, { command: 'view' }>;

const listingDepth = 2;
const headBytes = 12;

export async function viewPath(command: ViewCommand, context: OperationContext) {
    const absolutePath = await resolveReadPath(command.path, context);
    let handle: FileHandle | undefined;
    try {
        handle = await open(absolutePath, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
        return await viewOpened(command, { absolutePath, handle }, context);
    } catch (error) {
        return (
            stoppedBeforeReturn(context.signal, command.path) ??
            filesystemFailure(error, `Could not read file: ${command.path}.`)
        );
    } finally {
        await handle?.close();
    }
}

async function viewOpened(
    command: ViewCommand,
    file: { absolutePath: string; handle: FileHandle },
    context: OperationContext
) {
    const { handle } = file;
    const info = await handle.stat();
    if (info.isDirectory()) {
        return await viewDirectory(command.path, file.absolutePath);
    }
    if (!info.isFile()) {
        return notRegularFile(command.path);
    }
    const { buffer, bytesRead } = await handle.read(new Uint8Array(headBytes), 0, headBytes, 0);
    const head = buffer.subarray(0, bytesRead);
    if (isPdf(head)) {
        return await viewPdf(command.path, { handle, size: info.size }, context);
    }
    if (imageMediaType(head)) {
        return await storeImage(
            command.path,
            { read: () => handle.readFile(), size: info.size },
            context
        );
    }
    return viewText(command, await handle.readFile('utf-8'));
}

export function viewText(command: ViewCommand, content: string) {
    const lines = content.split('\n');
    if (content.endsWith('\n')) {
        lines.pop();
    }
    const totalLines = lines.length;
    const range = selectRange(command, totalLines);
    if (typeof range === 'string') {
        return textResult('failed', range);
    }

    const numbered = lines
        .slice(range.start - 1, range.end)
        .map(
            (line, index) =>
                `${String(range.start + index).padStart(6)}\t${line.replace(/\r$/u, '')}`
        )
        .join('\n');
    const truncation = truncateHead(numbered);
    if (truncation.firstLineExceedsLimit) {
        const firstLineSize = formatSize(Buffer.byteLength(lines[range.start - 1] ?? '', 'utf-8'));
        return textResult(
            'completed',
            `[Line ${range.start} is ${firstLineSize}, exceeds ${formatSize(DEFAULT_MAX_BYTES)} limit. Use bash: sed -n '${range.start}p' ${command.path} | head -c ${DEFAULT_MAX_BYTES}]`,
            { truncated: true }
        );
    }
    if (!truncation.truncated) {
        return textResult('completed', truncation.content);
    }
    const lastShown = range.start + truncation.outputLines - 1;
    const limit =
        truncation.truncatedBy === 'bytes' ? ` (${formatSize(DEFAULT_MAX_BYTES)} limit)` : '';
    return textResult(
        'completed',
        `${truncation.content}\n\n[Showing lines ${range.start}-${lastShown} of ${totalLines}${limit}. Use view_range [${lastShown + 1}, ${command.view_range?.[1] ?? -1}] to continue.]`,
        { truncated: true }
    );
}

function selectRange(command: ViewCommand, totalLines: number) {
    if (!command.view_range) {
        return { end: totalLines, start: 1 };
    }
    const [start, requestedEnd] = command.view_range;
    const shown = `Invalid view_range [${start}, ${requestedEnd}]`;
    if (start > totalLines) {
        return `${shown}: line ${start} is beyond the end of the file (${totalLines} lines).`;
    }
    if (requestedEnd === -1) {
        return { end: totalLines, start };
    }
    if (requestedEnd < start) {
        return `${shown}: the end line must be -1 or at least the start line.`;
    }
    if (requestedEnd > totalLines) {
        return `${shown}: line ${requestedEnd} is beyond the end of the file (${totalLines} lines).`;
    }
    return { end: requestedEnd, start };
}

async function viewDirectory(displayPath: string, absolutePath: string) {
    const entries = await listEntries(absolutePath, '', 1);
    const truncation = truncateHead(entries.join('\n'));
    const header = `Files and directories up to ${listingDepth} levels deep in ${displayPath}, excluding hidden items:`;
    const notice = truncation.truncated
        ? `\n\n[Showing ${truncation.outputLines} of ${entries.length} entries.]`
        : '';
    return textResult('completed', `${header}\n${truncation.content}${notice}`, {
        truncated: truncation.truncated,
    });
}

async function listEntries(directory: string, prefix: string, depth: number) {
    const children = (await readdir(directory, { withFileTypes: true }))
        .filter((entry) => !entry.name.startsWith('.'))
        .sort(compareEntries);
    const listed: string[] = [];
    for (const child of children) {
        const relative = `${prefix}${child.name}`;
        if (!child.isDirectory()) {
            listed.push(relative);
            continue;
        }
        listed.push(`${relative}/`);
        if (depth < listingDepth) {
            listed.push(
                ...(await listEntries(join(directory, child.name), `${relative}/`, depth + 1))
            );
        }
    }
    return listed;
}

function compareEntries(left: Dirent, right: Dirent) {
    return left.name < right.name ? -1 : Number(left.name > right.name);
}
