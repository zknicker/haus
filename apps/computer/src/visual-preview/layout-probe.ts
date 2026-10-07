import * as z from 'zod';
import { layoutFactsSource } from './layout-probe-source.ts';

export type LayoutFindingKind =
    | 'clipped-text'
    | 'horizontal-overflow'
    | 'svg-text-outside'
    | 'text-overlap';

export interface LayoutFinding {
    kind: LayoutFindingKind;
    message: string;
}

const rectSchema = z.object({
    bottom: z.number(),
    left: z.number(),
    right: z.number(),
    top: z.number(),
});
export type ProbeRect = z.output<typeof rectSchema>;

/**
 * Raw geometry the in-frame collector returns. The frame runs agent script,
 * so this is validated like any other untrusted input; the judgment calls
 * (thresholds, pairing) stay out here where they are pure and tested.
 */
export const layoutFactsSchema = z.object({
    clipCandidates: z.array(
        z.object({
            clientHeight: z.number(),
            clientWidth: z.number(),
            label: z.string(),
            scrollHeight: z.number(),
            scrollWidth: z.number(),
        })
    ),
    overflowRoots: z.array(z.object({ label: z.string(), right: z.number() })),
    scrollWidth: z.number(),
    svgTexts: z.array(z.object({ label: z.string(), rect: rectSchema, svg: rectSchema })),
    textBoxes: z.array(z.object({ label: z.string(), owner: z.number(), rect: rectSchema })),
    viewportWidth: z.number(),
});
export type LayoutFacts = z.output<typeof layoutFactsSchema>;

/** Evaluated in the frame's main world; returns `LayoutFacts` as JSON. */
export const layoutFactsExpression = `JSON.stringify((${layoutFactsSource})())`;

// Conservative on purpose: a finding an agent learns to ignore is worse than a
// miss. Sub-2px slop is antialiasing and rounding, not a layout bug.
const slopPx = 2;
const minOverlapSidePx = 3;
const minVerticalShare = 0.5;
const maxPerKind = 4;

export function analyzeLayout(facts: LayoutFacts): LayoutFinding[] {
    return [
        ...horizontalOverflow(facts),
        ...clippedText(facts),
        ...svgTextOutside(facts),
        ...textOverlaps(facts),
    ];
}

function horizontalOverflow(facts: LayoutFacts): LayoutFinding[] {
    const excess = facts.scrollWidth - facts.viewportWidth;
    if (excess <= slopPx) {
        return [];
    }
    const culprits = facts.overflowRoots
        .filter((root) => root.right - facts.viewportWidth > slopPx)
        .map((root) => `${root.label} (+${Math.round(root.right - facts.viewportWidth)}px)`);
    const suffix = culprits.length > 0 ? `: ${capList(culprits)}` : '';
    return [
        {
            kind: 'horizontal-overflow',
            message: `content is ${Math.round(excess)}px wider than the ${facts.viewportWidth}px frame and gets cut off${suffix}`,
        },
    ];
}

function clippedText(facts: LayoutFacts): LayoutFinding[] {
    const clipped = facts.clipCandidates.filter(
        (candidate) =>
            candidate.scrollWidth - candidate.clientWidth > slopPx ||
            candidate.scrollHeight - candidate.clientHeight > slopPx
    );
    return capFindings(
        clipped.map((candidate) => {
            const hiddenX = Math.max(0, candidate.scrollWidth - candidate.clientWidth);
            const hiddenY = Math.max(0, candidate.scrollHeight - candidate.clientHeight);
            const hidden = [
                hiddenX > slopPx ? `${Math.round(hiddenX)}px wide` : null,
                hiddenY > slopPx ? `${Math.round(hiddenY)}px tall` : null,
            ]
                .filter(Boolean)
                .join(', ');
            return {
                kind: 'clipped-text' as const,
                message: `${candidate.label} is clipped by overflow hidden (${hidden} hidden)`,
            };
        })
    );
}

function svgTextOutside(facts: LayoutFacts): LayoutFinding[] {
    const outside = facts.svgTexts.flatMap(({ label, rect, svg }) => {
        const sides = [
            svg.left - rect.left > slopPx ? `left by ${Math.round(svg.left - rect.left)}px` : null,
            rect.right - svg.right > slopPx
                ? `right by ${Math.round(rect.right - svg.right)}px`
                : null,
            svg.top - rect.top > slopPx ? `top by ${Math.round(svg.top - rect.top)}px` : null,
            rect.bottom - svg.bottom > slopPx
                ? `bottom by ${Math.round(rect.bottom - svg.bottom)}px`
                : null,
        ].filter((side): side is string => side !== null);
        return sides.length > 0
            ? [
                  {
                      kind: 'svg-text-outside' as const,
                      message: `${label} runs past the svg ${sides.join(', ')}`,
                  },
              ]
            : [];
    });
    return capFindings(outside);
}

function textOverlaps(facts: LayoutFacts): LayoutFinding[] {
    const overlaps: LayoutFinding[] = [];
    const boxes = facts.textBoxes;
    for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
            const a = boxes[i];
            const b = boxes[j];
            if (a && b && a.owner !== b.owner && meaningfulOverlap(a.rect, b.rect)) {
                overlaps.push({
                    kind: 'text-overlap',
                    message: `${a.label} overlaps ${b.label}`,
                });
            }
        }
    }
    return capFindings(overlaps);
}

/**
 * Two text boxes collide when they share most of the shorter one's height and
 * a few real pixels of width: labels on one baseline running into each other.
 * Boxes that merely graze vertically (tight line height) do not count.
 */
export function meaningfulOverlap(a: ProbeRect, b: ProbeRect): boolean {
    const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (width < minOverlapSidePx || height < minOverlapSidePx) {
        return false;
    }
    const shorter = Math.min(a.bottom - a.top, b.bottom - b.top);
    return shorter > 0 && height / shorter >= minVerticalShare;
}

function capFindings(findings: LayoutFinding[]): LayoutFinding[] {
    if (findings.length <= maxPerKind) {
        return findings;
    }
    const [first] = findings;
    const rest = findings.length - maxPerKind;
    return [
        ...findings.slice(0, maxPerKind),
        {
            kind: first?.kind ?? 'text-overlap',
            message: `…and ${rest} more like this`,
        },
    ];
}

function capList(items: string[]): string {
    const shown = items.slice(0, 3).join(', ');
    return items.length > 3 ? `${shown}, and ${items.length - 3} more` : shown;
}
