import { expect, test } from 'bun:test';
import { authoredSkillFiles } from './before-skill.mjs';

const listing = (...paths: string[]) => paths.join('\n');
const skill = 'packages/agent-workspace/src/visuals-skill';

test('an old flat revision yields its three markdown files and nothing generated', () => {
    expect(
        authoredSkillFiles(
            listing(
                `${skill}/SKILL.md`,
                `${skill}/design-system.md`,
                `${skill}/icons.md`,
                `${skill}/icons.ts`,
                `${skill}/markdown.d.ts`
            )
        )
    ).toEqual(['SKILL.md', 'design-system.md', 'icons.md']);
});

test('a modular revision carries its fragments too', () => {
    expect(
        authoredSkillFiles(
            listing(
                `${skill}/SKILL.md`,
                `${skill}/charts.md`,
                `${skill}/fragments/kpi-row.md`,
                `${skill}/fragments.ts`
            )
        )
    ).toEqual(['SKILL.md', 'charts.md', 'fragments/kpi-row.md']);
});
