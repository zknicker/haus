import { expect, test } from 'bun:test';
import { formatRulesBlock } from './rules-block.ts';

test('each changed rules file arrives under its Drive path, in the order given', () => {
    expect(
        formatRulesBlock([
            { content: '# Haus\n- Reply in threads.\n', path: 'haus/AGENTS.md' },
            { content: '- Ship on Fridays.', path: 'agents/blippy/AGENTS.md' },
        ])
    ).toBe(
        [
            '<haus-rules>',
            'The rules in haus/AGENTS.md, as they are now. Follow them. Haus puts them here whenever they changed since this session last saw them.',
            '',
            '# Haus',
            '- Reply in threads.',
            '</haus-rules>',
            '',
            '<haus-rules>',
            'The rules in agents/blippy/AGENTS.md, as they are now. Follow them. Haus puts them here whenever they changed since this session last saw them.',
            '',
            '- Ship on Fridays.',
            '</haus-rules>',
        ].join('\n')
    );
});

test('a deleted rules file is announced once by its path', () => {
    expect(formatRulesBlock([{ content: null, path: 'agents/blippy/AGENTS.md' }])).toBe(
        [
            '<haus-rules>',
            'agents/blippy/AGENTS.md was deleted, so its rules no longer apply.',
            '</haus-rules>',
        ].join('\n')
    );
    expect(formatRulesBlock([])).toBeNull();
});
