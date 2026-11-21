import {
    composePdfPage,
    composePdfTimedOut,
    composePdfTooManyPages,
    composePdfUnreadable,
    pdfViewNotes,
} from '@haus/agent-prompt';
import type { EditorCommand } from '@haus/api';
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateHead } from '@haus/api/truncate';
import { type InvocationAnswer, invocationToolOutcome } from '../invocations/invocation-client.ts';
import type { ToolOutcome, ToolResultContent } from '../run-context.ts';
import { type PageLook, type PdfPages, readPdf } from './pdf-pages.ts';

type ViewRange = readonly [number, number];

const pageImageBound = { range: 10, whole: 5 } as const;

export const pdfLimits = { maxPages: 2000, timeoutMs: 60_000 } as const;

export async function editOutcome(
    answer: InvocationAnswer,
    command: EditorCommand,
    signal: AbortSignal
) {
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
    const viewed = await viewPdf(Uint8Array.fromBase64(output.base64), command.view_range, {
        signal,
    });
    return { ...viewed, invocation: frame.outcome } satisfies ToolOutcome;
}

export async function viewPdf(
    bytes: Uint8Array,
    range: ViewRange | undefined,
    options: { signal: AbortSignal; timeoutMs?: number }
) {
    const timeoutMs = options.timeoutMs ?? pdfLimits.timeoutMs;
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    try {
        return await readPdf(bytes, AbortSignal.any([options.signal, timeout.signal]), (pdf) =>
            pdfView(pdf, range)
        );
    } catch (error) {
        options.signal.throwIfAborted();
        if (timeout.signal.aborted) {
            return refusal(composePdfTimedOut(timeoutMs / 1000));
        }
        return refusal(
            composePdfUnreadable(error instanceof Error ? error.message : String(error))
        );
    } finally {
        clearTimeout(timer);
    }
}

export async function pdfView(pdf: PdfPages, range: ViewRange | undefined) {
    const { total } = pdf;
    if (total > pdfLimits.maxPages) {
        return refusal(composePdfTooManyPages(total, pdfLimits.maxPages));
    }
    const selected = selectPages(range, total);
    if (selected.kind === 'invalid') {
        return {
            content: [textPart(pdfViewNotes.invalidRange(selected.range, total))],
            isError: true,
        };
    }
    const shown = await fitPages(pdf, selected);
    const looks = new Map<number, PageLook>();
    for (const page of shown.pages) {
        if (!range) {
            looks.set(page.number, await pdf.look(page.number));
        }
    }
    const wanted = shown.pages
        .map((page) => page.number)
        .filter((page) => range || looks.get(page)?.kind !== 'text');
    const bound = range ? pageImageBound.range : pageImageBound.whole;
    const rendered = new Set(wanted.slice(0, bound));
    const withheld = wanted.slice(bound);

    const parts = partsBuilder();
    for (const page of shown.pages) {
        parts.text(page.block);
        if (page.cut) {
            parts.text(pdfViewNotes.cut(page.number, formatSize(DEFAULT_MAX_BYTES)));
        }
        if (rendered.has(page.number)) {
            parts.image(await pageImage(pdf, page.number, looks.get(page.number)));
        }
    }
    if (shown.next !== null) {
        parts.text(
            pdfViewNotes.continue(
                { first: selected.start, last: shown.pages.at(-1)?.number ?? selected.start },
                total,
                [shown.next, range?.[1] ?? -1]
            )
        );
    }
    if (withheld.length > 0) {
        parts.text(
            range ? pdfViewNotes.rangeWithoutImages(withheld) : pdfViewNotes.moreFigures(withheld)
        );
    }
    return { content: parts.content, isError: false };
}

function selectPages(range: ViewRange | undefined, total: number) {
    if (!range) {
        return { end: total, kind: 'pages', start: 1 } as const;
    }
    const [start, requestedEnd] = range;
    const end = requestedEnd === -1 ? total : requestedEnd;
    return start >= 1 && start <= end && end <= total
        ? ({ end, kind: 'pages', start } as const)
        : ({ kind: 'invalid', range } as const);
}

async function fitPages(pdf: PdfPages, selected: { end: number; start: number }) {
    const pages: { block: string; cut: boolean; number: number }[] = [];
    let lines = 0;
    let bytes = 0;
    for (let number = selected.start; number <= selected.end; number++) {
        const block = composePdfPage(number, pdf.total, await pdf.text(number));
        const blockLines = block.split('\n').length + (pages.length > 0 ? 1 : 0);
        const blockBytes = Buffer.byteLength(block, 'utf-8') + (pages.length > 0 ? 2 : 0);
        if (lines + blockLines > DEFAULT_MAX_LINES || bytes + blockBytes > DEFAULT_MAX_BYTES) {
            if (pages.length > 0) {
                return { next: number, pages };
            }
            pages.push({ block: truncateHead(block).content, cut: true, number });
            return { next: number < selected.end ? number + 1 : null, pages };
        }
        pages.push({ block, cut: false, number });
        lines += blockLines;
        bytes += blockBytes;
    }
    return { next: null, pages };
}

async function pageImage(pdf: PdfPages, page: number, look: PageLook | undefined) {
    try {
        return await pdf.render(page, look ?? (await pdf.look(page)));
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return textPart(pdfViewNotes.imageFailed(page, reason));
    }
}

function partsBuilder() {
    const content: ToolResultContent[] = [];
    const text = (value: string) => {
        const last = content.at(-1);
        if (last?.type === 'text') {
            content[content.length - 1] = textPart(`${last.text}\n\n${value}`);
        } else {
            content.push(textPart(value));
        }
    };
    return {
        content,
        image(part: ToolResultContent) {
            if (part.type === 'text') {
                text(part.text);
            } else {
                content.push(part);
            }
        },
        text,
    };
}

function refusal(text: string) {
    return { content: [textPart(text)], isError: true };
}

function textPart(text: string) {
    return { text, type: 'text' } as const;
}
