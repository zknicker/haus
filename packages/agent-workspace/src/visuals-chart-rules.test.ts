import { expect, test } from 'bun:test';
import {
    fragmentFiles,
    skillModules,
} from '../../../scripts/visuals-lab/engine/skill-fragments.mjs';
import { defaultVisualsSkill, visualsSkillFiles } from './managed-skills.ts';

const moduleSource = (name: string) => visualsSkillFiles[`references/${name}`] ?? '';
const flowText = (text: string) => text.replace(/\s+/gu, ' ');
const everySkillSource = () => [
    defaultVisualsSkill,
    ...skillModules.map(moduleSource),
    ...fragmentFiles().map((file: string) => moduleSource(`fragments/${file}`)),
];

/**
 * The 24px cap drew 12–24px pins floating in wide bands; columns now take a
 * share of their slot, and column charts are fluid plots — a fixed pixel height
 * with x in percent and y in pixels keeps 12px text and a full plot on a phone.
 */
test('visuals retires the 24px bar cap and draws column charts as fluid plots', () => {
    const marks = flowText(moduleSource('marks-and-anatomy.md'));

    for (const source of everySkillSource()) {
        expect(flowText(source)).not.toMatch(/at most 24px/iu);
        expect(source).not.toContain('Math.min(24, slot');
    }
    expect(marks).toContain('**x is a percentage of its width and y is pixels**');
    expect(marks).toContain('the plot `<svg width="100%" height="240">`');
});

/**
 * The left gutter is sized by measured glyph widths: 7.6px a figure at 12px,
 * 11.4 for `%` and `M`. A battery run that sized an `8%` axis by 7.6 alone
 * pushed every tick 3px past the svg edge.
 */
test('visuals sizes the tick gutter by the measured glyph widths', () => {
    const marks = flowText(moduleSource('marks-and-anatomy.md'));

    expect(marks).toContain('`%` and `M` count 11.4');
    expect(marks).toContain("'%M'.includes(c) ? 11.4 : 7.6");
    expect(flowText(defaultVisualsSkill)).toContain('11.4 for `%` or `M`, plus 8');
});

/**
 * The reply beside a visual used to restate it: battery replies ran a median
 * ~260 prose words, mostly re-listing the numbers on screen. And a report
 * answered in chat is a visual, not a page, even when the user says "report".
 */
test('visuals keeps the reply to the takeaway and reports inline', () => {
    const skill = flowText(defaultVisualsSkill);

    expect(skill).toContain('**The reply adds only what the visual does not show**');
    expect(skill).toContain('under ~80 words');
    expect(skill).toContain('Routing: anything answered in chat is a **visual**');
    expect(skill).toContain('[report](references/fragments/report.md)');
    expect(flowText(moduleSource('charts.md'))).toContain('## Reports');
});

/**
 * Agents drew a goal pace dashed on top of a near-identical actual line, which
 * the old rule's "one solid, one dashed" advice invited. The procedure now
 * measures the gap before a second line and names dashing as no fix.
 */
test('visuals guards against near-coincident lines in the chart procedure', () => {
    const skill = flowText(defaultVisualsSkill);

    expect(skill).toContain('**Before drawing a second line**');
    expect(skill).toContain('dashing one does not fix it');
    expect(skill).toContain('("$381 ahead of pace")');
});
