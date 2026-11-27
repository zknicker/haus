import { expect, test } from 'bun:test';
import { getManualTopic, searchManualTopics } from './index.ts';

const body = getManualTopic('rules')?.body ?? '';

test('rules guidance describes each file, who reads it, and when', () => {
    for (const line of [
        "`drive/haus/AGENTS.md` holds the team's rules. People own it.",
        "`drive/projects/<key>/AGENTS.md` holds a Project's rules for everyone working in it. Haus puts your Project's file in your turn input whenever it changed, and a crew Task reads its Project's file too.",
        '`drive/agents/<your handle>/AGENTS.md` holds your own rules',
        'Haus puts it in your turn input whenever it changed, and again after a reset or compaction',
        '`drive/agents/<your handle>/WORKER.md` holds the rules your crew Tasks follow.',
        'Haus hands it to each Task you start in its turn input and again after it changes, so your brief does not repeat it (see tasks).',
        'the preferences people show in passing, and the index of your notes. It can point at your rule files without repeating them.',
    ]) {
        expect(body).toContain(line);
    }
    expect(body).not.toMatch(/from now on|picks the file|goes in your/iu);
});

test('rules guidance edits the file in the drive/ folder and cites it', () => {
    expect(body).toContain('You edit these files in your `drive/` folder with your edit tool');
    expect(body).toContain('keeps it as a revision with you as its author');
    expect(body).toContain('`[WORKER.md](drive://agents/<your handle>/WORKER.md)`');
    expect(body).not.toMatch(/haus (files|drive) (pull|push)/u);
    expect(getManualTopic('drive')?.related).toContain('rules');
});

test('a standing-rule search finds the rules topic', () => {
    expect(
        searchManualTopics('standing rules AGENTS.md WORKER.md', { limit: 5, scope: 'all' }).map(
            ({ id }) => id
        )
    ).toContain('rules');
});
