import type { Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { EditorCommand } from '@haus/api';
import { isPdf, viewPdf } from './editor-pdf.ts';
import { filesystemFailure, imageMediaType, readFileHead, viewImage } from './files.ts';
import { type OperationContext, textResult } from './operation.ts';
import { resolveReadPath } from './paths.ts';
import { DEFAULT_MAX_BYTES, formatSize, truncateHead } from './pi/truncate.ts';

type ViewCommand = Extract<EditorCommand, { command: 'view' }>;

const listingDepth = 2;

export async function viewPath(command: ViewCommand, context: OperationContext) {
    const absolutePath = await resolveReadPath(command.path, context);
    try {
        if ((await stat(absolutePath)).isDirectory()) {
            return await viewDirectory(command.path, absolutePath);
        }
        const head = await readFileHead(absolutePath);
        if (isPdf(head)) {
            return await viewPdf(command.path, absolutePath, context);
        }
        if (imageMediaType(head)) {
            return await viewImage(command.path, context);
        }
        return viewText(command, await readFile(absolutePath, 'utf-8'));
    } catch (error) {
        return filesystemFailure(error, `Could not read file: ${command.path}.`);
    }
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
