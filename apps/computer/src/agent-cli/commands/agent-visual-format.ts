import { splitVisualFences } from '@haus/api/widgets/visual';
import { visualHeights } from '@haus/api/widgets/visual/frame';
import type { LayoutFindingKind } from '../../visual-preview/layout-probe.ts';
import {
    maxPreviewFences,
    type VisualPreviewFence,
    type VisualPreviewFenceResult,
    type VisualPreviewRender,
} from '../../visual-preview/render.ts';
import { renderTiming } from '../../visual-preview/render-steps.ts';

export interface PreviewInput {
    fences: VisualPreviewFence[];
    notes: string[];
}

/**
 * A draft message renders each of its ```visual fences; input with no fence
 * is a bare fence body. Past the cap, the rest are listed as skipped.
 */
export function readPreviewInput(content: string): PreviewInput {
    const visuals = splitVisualFences(content).flatMap((segment) =>
        segment.kind === 'visual' ? [segment] : []
    );
    if (visuals.length === 0) {
        return { fences: [{ html: content, title: undefined }], notes: [] };
    }
    const notes: string[] = [];
    if (visuals.some((visual) => visual.open)) {
        notes.push(
            'A ```visual fence is never closed; the chat renders it as still streaming. Close it with ``` on its own line.'
        );
    }
    if (visuals.length > maxPreviewFences) {
        notes.push(
            `Previewed the first ${maxPreviewFences} of ${visuals.length} visuals; preview the rest separately.`
        );
    }
    return {
        fences: visuals
            .slice(0, maxPreviewFences)
            .map((visual) => ({ html: visual.html, title: visual.title })),
        notes,
    };
}

/** File-safe, unique slugs: the fence title, else `visual-<n>`. */
export function previewSlugs(fences: readonly VisualPreviewFence[]): string[] {
    const used = new Set<string>();
    return fences.map((fence, index) => {
        const base =
            (fence.title ?? '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/gu, '-')
                .replace(/^-+|-+$/gu, '')
                .slice(0, 48)
                .replace(/-+$/u, '') || `visual-${index + 1}`;
        let slug = base;
        for (let n = 2; used.has(slug); n += 1) {
            slug = `${base}-${n}`;
        }
        used.add(slug);
        return slug;
    });
}

export function previewFileName(slug: string, render: { scheme: string; width: number }) {
    return `${slug}-${render.scheme}-${render.width}.png`;
}

const findingLabels: Record<LayoutFindingKind, string> = {
    'clipped-text': 'clipped text',
    'horizontal-overflow': 'horizontal overflow',
    'svg-text-outside': 'svg text outside',
    'text-overlap': 'text overlap',
};

/** One compact block per fence; a line seen in only some renders names them. */
export function formatPreviewReport(
    results: readonly VisualPreviewFenceResult[],
    paths: readonly (readonly (string | null)[])[],
    notes: readonly string[]
): string {
    const blocks = results.map((result, index) => {
        const title = result.fence.title ?? `Visual ${index + 1}`;
        const lines = [title];
        const labelWidth = Math.max(...result.renders.map((render) => renderLabel(render).length));
        result.renders.forEach((render, renderIndex) => {
            const path = paths[index]?.[renderIndex] ?? 'no image';
            lines.push(
                `  ${renderLabel(render).padEnd(labelWidth)}  ${path}  ${heightText(render)}`
            );
        });
        const issues = groupIssues(result.renders);
        if (issues.length === 0) {
            lines.push('  No errors or layout findings.');
        } else {
            lines.push(...issues.map((issue) => `  - ${issue}`));
        }
        return lines.join('\n');
    });
    const tail = [
        ...notes.map((note) => `Note: ${note}`),
        'Open each PNG with your image viewer to look at it before you send.',
    ];
    return `${[...blocks, tail.join('\n')].join('\n\n')}\n`;
}

function renderLabel(render: { scheme: string; width: number }): string {
    return `${render.scheme} ${render.width}`;
}

function heightText(render: VisualPreviewRender): string {
    if (render.timedOut) {
        return `timed out after ${renderTiming.totalMs / 1000}s (a script may be looping or waiting)`;
    }
    const reported = render.reportedHeight;
    if (reported === null) {
        return `height ${render.height}px (no size report; the chat falls back to ${visualHeights.fallback}px)`;
    }
    if (reported > visualHeights.max) {
        return `height ${render.height}px (clamped from ${Math.round(reported)}px)`;
    }
    if (reported < visualHeights.min) {
        return `height ${render.height}px (content ${Math.round(reported)}px, raised to the ${visualHeights.min}px minimum)`;
    }
    return `height ${render.height}px`;
}

function groupIssues(renders: readonly VisualPreviewRender[]): string[] {
    const seen = new Map<string, string[]>();
    for (const render of renders) {
        const label = renderLabel(render);
        const lines = [
            ...render.exceptions.map((text) => `exception: ${text}`),
            ...render.consoleErrors.map((text) => `console error: ${text}`),
            ...render.cspViolations.map((text) => `CSP: ${text}`),
            ...render.blockedRequests.map((url) => `blocked request: ${url}`),
            ...render.findings.map(
                (finding) => `${findingLabels[finding.kind]}: ${finding.message}`
            ),
        ];
        for (const line of new Set(lines)) {
            seen.set(line, [...(seen.get(line) ?? []), label]);
        }
    }
    return [...seen].map(([line, labels]) =>
        labels.length === renders.length ? line : `${line} [${labels.join(', ')}]`
    );
}
