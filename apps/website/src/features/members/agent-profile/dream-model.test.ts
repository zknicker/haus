import { expect, test } from 'bun:test';
import type { AgentDreamFile } from '@haus/api';
import {
    dreamEmptyState,
    formatDreamFiles,
    formatDreamHeadline,
    formatDreamRowHeadline,
    hunkSection,
    isQuietDream,
    parseDreamPatch,
} from './dream-model.ts';
import {
    dreamSummaryHeadline,
    dreamSummaryMarkdown,
    formatFollowUpWhen,
} from './dream-summary-model.ts';

test('the summary headline drops a leading bullet, and plain lines keep their breaks', () => {
    expect(dreamSummaryHeadline('- Priya taught me tone.\n- Sam fixed dates.')).toBe(
        'Priya taught me tone.'
    );
    expect(dreamSummaryMarkdown('a\nb\n\nc')).toBe('a  \nb\n\nc');
    expect(dreamSummaryMarkdown('- a\n- b')).toBe('- a\n- b');
});

const patch = [
    'diff --git a/MEMORY.md b/MEMORY.md',
    '--- a/MEMORY.md',
    '+++ b/MEMORY.md',
    '@@ -6,9 +6,10 @@ ## Role',
    ' ',
    ' ## Standing Preferences',
    '+- Never raise a bid more than 20% at once.',
    ' ',
    ' ## Active Context',
    '-- Waiting on the Q4 budget.',
    '-- Creative refresh due Oct 20.',
    '-- Prime Day recap pending.',
    '+- Q4 budget approved: $18k.',
    '+- Mira shoots the gift-set video.',
    '+- Halloween ramp is live.',
    ' ',
    '@@ -20,3 +21,2 @@ ## Key Knowledge',
    ' - Top term: insulated tumbler.',
    '-- Old fact.',
    ' ',
    'diff --git a/notes/ramp plan.md b/notes/ramp plan.md',
    '--- /dev/null',
    '+++ b/notes/ramp plan.md',
    '@@ -0,0 +1,2 @@',
    '+# Ramp',
    '+--- step up Oct 14',
    '',
].join('\n');

const files: AgentDreamFile[] = [
    { added: 4, change: 'modified', path: 'MEMORY.md', removed: 4 },
    { added: 2, change: 'added', path: 'notes/ramp plan.md', removed: 0 },
    { added: 3, change: 'added', path: 'notes/other.md', removed: 0 },
];

test('the patch splits by file, numbering lines from each hunk header', () => {
    const parsed = parseDreamPatch(patch);
    expect([...parsed.keys()]).toEqual(['MEMORY.md', 'notes/ramp plan.md']);
    const [first, second] = parsed.get('MEMORY.md') ?? [];
    expect(first && hunkSection(first)).toBe('Role');
    expect(first?.lines[2]).toEqual({
        kind: 'add',
        newLine: 8,
        oldLine: null,
        text: '- Never raise a bid more than 20% at once.',
    });
    expect(second?.lines[1]).toEqual({
        kind: 'del',
        newLine: null,
        oldLine: 21,
        text: '- Old fact.',
    });
    // A content line that looks like a file header stays content.
    expect(parsed.get('notes/ramp plan.md')?.[0]?.lines.at(-1)?.text).toBe('--- step up Oct 14');
});

test('the headline names the MEMORY.md sections the patch touched, then notes', () => {
    expect(formatDreamHeadline(files, parseDreamPatch(patch))).toBe(
        'Rewrote Active Context · +1 preference · −1 fact · added 2 notes'
    );
});

test('a list row without the patch reads by file, and an empty dream says so', () => {
    expect(formatDreamHeadline(files)).toBe('Updated memory · added 2 notes');
    expect(formatDreamHeadline([])).toBe('No changes');
    expect(formatDreamHeadline([], null, true)).toBe('Too many memory files to compare');
    expect(formatDreamFiles(files)).toBe('MEMORY.md, ramp plan.md, other.md');
});

test('a section added or removed whole is named, not counted', () => {
    const sectioned = parseDreamPatch(
        [
            'diff --git a/MEMORY.md b/MEMORY.md',
            '@@ -10,2 +10,5 @@ ## Active Context',
            ' - Halloween ramp is live.',
            '+',
            '+## Open Questions',
            '+- Does November weighting hold?',
            ' ',
            '@@ -30,3 +33,0 @@ ## Key Knowledge',
            '-## Scratch',
            '-- temp',
            '-',
            '',
        ].join('\n')
    );
    expect(
        formatDreamHeadline(
            [{ added: 3, change: 'modified', path: 'MEMORY.md', removed: 3 }],
            sectioned
        )
    ).toBe('Added Open Questions · removed Scratch');
});

test('a row leads with the summary first line, falling back to the file headline', () => {
    const base = { files, summary: null, truncated: false };
    expect(formatDreamRowHeadline(base)).toBe('Updated memory · added 2 notes');
    expect(
        formatDreamRowHeadline({ ...base, summary: '\n- Mira wants **short** recaps.\nMore' })
    ).toBe('Mira wants short recaps.');
    expect(formatDreamRowHeadline({ ...base, summary: '   ' })).toBe(
        'Updated memory · added 2 notes'
    );
});

test('a dream with a summary or follow-ups is not quiet even with no file changes', () => {
    const empty = { files: [], truncated: false };
    expect(isQuietDream({ ...empty, followUps: [], summary: null })).toBe(true);
    expect(isQuietDream({ ...empty, followUps: [], summary: 'Learned a thing.' })).toBe(false);
    const followUp = {
        anchorChatId: 'cht_one',
        fireAt: '2026-10-21T09:00:00.000Z',
        reminderId: 'rem_one',
        title: 'Check the invoice',
    };
    expect(isQuietDream({ ...empty, followUps: [followUp], summary: null })).toBe(false);
});

test('a follow-up reads Tomorrow, Today, or the date, then its local time', () => {
    const now = new Date(2026, 9, 20, 22, 0).getTime();
    const at = (day: number) => new Date(2026, 9, day, 9, 0).toISOString();
    expect(formatFollowUpWhen(at(21), now)).toBe('Tomorrow 9:00 am');
    expect(formatFollowUpWhen(at(20), now)).toBe('Today 9:00 am');
    expect(formatFollowUpWhen(at(23), now)).toMatch(/^Oct 23 9:00 am$/);
});

test('a truncated dream is not quiet: its row opens and both say why it shows no changes', () => {
    const truncated = { files: [], truncated: true };
    expect(isQuietDream(truncated)).toBe(false);
    expect(isQuietDream({ files: [], truncated: false })).toBe(true);
    expect(formatDreamHeadline([], null, true)).toBe('Too many memory files to compare');
    expect(dreamEmptyState(truncated)).toContain('Too many memory files to compare');
    expect(dreamEmptyState({ files: [], truncated: false })).toBe(
        'Memory was already consolidated; nothing changed.'
    );
    expect(dreamEmptyState({ files, truncated: false })).toBeNull();
});
