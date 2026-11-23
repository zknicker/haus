import { expect, test } from 'bun:test';
import { skillDescription } from './host-skill-bundle.ts';

test('a skill reads its frontmatter description', () => {
    expect(skillDescription('---\nname: deploy\ndescription: Ship the app.\n---\n# Deploy\n')).toBe(
        'Ship the app.'
    );
});

test('an empty description never surfaces a frontmatter line', () => {
    const content = [
        '---',
        'name: tasks',
        'description: >',
        '---',
        '',
        '---',
        'name: tasks',
        'description: >',
        '  Use for the shared Tasks board.',
        '---',
        '',
        '# Tasks',
    ].join('\n');

    expect(skillDescription(content)).toBe('Use for the shared Tasks board.');
});

test('without any description the first body line describes the skill', () => {
    expect(skillDescription('---\nname: notes\ndescription: >\n---\n\n# Meeting notes\n')).toBe(
        'Meeting notes'
    );
});
