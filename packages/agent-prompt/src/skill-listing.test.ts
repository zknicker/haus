import { expect, test } from 'bun:test';
import { renderSkillListing } from './skill-listing.ts';

test('lists each Drive skill by name and description and names the verb that opens one', () => {
    expect(
        renderSkillListing([
            { description: 'Verify a release before it ships', name: 'release-checks' },
            { description: 'Charts and pages people will see', name: 'visuals' },
        ])
    ).toBe(`## Skills

Your skills, by name and description. Before work one covers, open it with \`haus skill view <name>\` and follow it.

- release-checks: Verify a release before it ships
- visuals: Charts and pages people will see`);
});

test('an Agent with no skills gets no section', () => {
    expect(renderSkillListing([])).toBe('');
});
