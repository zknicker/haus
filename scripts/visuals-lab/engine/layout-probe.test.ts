import { expect, test } from 'bun:test';
import {
    analyzeLayout,
    type LayoutFacts,
    meaningfulOverlap,
    type ProbeRect,
} from './layout-probe.ts';

const rect = (left: number, top: number, right: number, bottom: number): ProbeRect => ({
    bottom,
    left,
    right,
    top,
});

const facts = (overrides: Partial<LayoutFacts> = {}): LayoutFacts => ({
    clipCandidates: [],
    overflowRoots: [],
    scrollWidth: 736,
    seriesLines: [],
    svgTexts: [],
    textBoxes: [],
    viewportWidth: 736,
    ...overrides,
});

test('a clean layout has no findings', () => {
    expect(analyzeLayout(facts())).toEqual([]);
});

test('horizontal overflow names the elements that push past the frame', () => {
    const findings = analyzeLayout(
        facts({ overflowRoots: [{ label: 'div.wide', right: 900 }], scrollWidth: 900 })
    );
    expect(findings).toEqual([
        {
            kind: 'horizontal-overflow',
            message:
                'content is 164px wider than the 736px frame and gets cut off: div.wide (+164px)',
        },
    ]);
});

test('sub-pixel and rounding slop is not a finding', () => {
    const findings = analyzeLayout(
        facts({
            clipCandidates: [
                {
                    clientHeight: 20,
                    clientWidth: 100,
                    label: 'div',
                    scrollHeight: 21,
                    scrollWidth: 102,
                },
            ],
            scrollWidth: 738,
            svgTexts: [
                { label: 'svg text "A"', rect: rect(-1, 0, 50, 10), svg: rect(0, 0, 100, 100) },
            ],
        })
    );
    expect(findings).toEqual([]);
});

test('clipped text reports how much is hidden on each axis', () => {
    const [finding] = analyzeLayout(
        facts({
            clipCandidates: [
                {
                    clientHeight: 20,
                    clientWidth: 100,
                    label: 'p "Long"',
                    scrollHeight: 60,
                    scrollWidth: 100,
                },
            ],
        })
    );
    expect(finding).toEqual({
        kind: 'clipped-text',
        message: 'p "Long" is clipped by overflow hidden (40px tall hidden)',
    });
});

test('svg text outside its svg names each side it crosses', () => {
    const [finding] = analyzeLayout(
        facts({
            svgTexts: [
                {
                    label: 'svg text "Peak"',
                    rect: rect(680, -6, 760, 10),
                    svg: rect(0, 0, 736, 200),
                },
            ],
        })
    );
    expect(finding?.message).toBe('svg text "Peak" runs past the svg right by 24px, top by 6px');
});

test('labels on one baseline that run into each other overlap; grazing lines do not', () => {
    expect(meaningfulOverlap(rect(0, 0, 100, 16), rect(80, 0, 180, 16))).toBe(true);
    // Tight line height: next line's box grazes 4px of a 16px box.
    expect(meaningfulOverlap(rect(0, 0, 300, 16), rect(0, 12, 300, 28))).toBe(false);
    // Touching edges.
    expect(meaningfulOverlap(rect(0, 0, 100, 16), rect(101, 0, 200, 16))).toBe(false);
});

test('pieces of one wrapped text node never overlap themselves', () => {
    const findings = analyzeLayout(
        facts({
            textBoxes: [
                { label: 'p "a"', owner: 1, rect: rect(0, 0, 100, 16) },
                { label: 'p "a"', owner: 1, rect: rect(50, 0, 150, 16) },
            ],
        })
    );
    expect(findings).toEqual([]);
});

test('overlap findings are capped with a count of the rest', () => {
    const textBoxes = Array.from({ length: 7 }, (_, index) => ({
        label: `svg text "${index}"`,
        owner: index,
        rect: rect(0, 0, 100, 16),
    }));
    const findings = analyzeLayout(facts({ textBoxes }));
    expect(findings).toHaveLength(5);
    expect(findings.at(-1)?.message).toBe('…and 17 more like this');
});
