import { expect, test } from 'bun:test';
import { getManualTopic, searchManualTopics } from './index.ts';

const body = getManualTopic('rules')?.body ?? '';

test('rules guidance names one file per audience and keeps facts in MEMORY.md', () => {
    for (const file of [
        '`drive/agents/<your handle>/AGENTS.md` holds your own rules',
        '`drive/agents/<your handle>/WORKER.md` holds the rules for every Worker you run',
        'Haus does not hand a cloud agent this file, so put its rules in the brief you launch it with.',
        '`drive/projects/<key>/AGENTS.md` holds the rules for everyone working in that Project',
        'Drive does not accept files under `projects/` yet',
        "`drive/haus/AGENTS.md` holds the team's rules. People own it; edit it only when asked.",
    ]) {
        expect(body).toContain(file);
    }
    expect(body).toContain('MEMORY.md holds facts, so a rule never goes there.');
    expect(body).toContain(
        'Preferences you notice in passing, with no rule set, stay under Standing Preferences in MEMORY.md.'
    );
    expect(body).toContain(
        '"From now on, every Worker attaches before/after screenshots" goes in your `WORKER.md`.'
    );
    expect(body).toContain(
        '"My timezone is Pacific" is a fact, not a rule, and goes in MEMORY.md.'
    );
});

test('rules guidance edits the file in the drive/ folder and cites it', () => {
    expect(body).toContain('Edit the file in your `drive/` folder with your edit tool');
    expect(body).toContain('A rule you find in MEMORY.md belongs in its rule file: move it there.');
    expect(body).toContain('`[WORKER.md](drive://agents/<your handle>/WORKER.md)`');
    expect(body).not.toMatch(/haus (files|drive) (pull|push)/u);
    expect(getManualTopic('drive')?.related).toContain('rules');
});

test('a "from now on" search finds the rules topic', () => {
    expect(
        searchManualTopics('from now on standing rule', { limit: 5, scope: 'all' }).map(
            ({ id }) => id
        )
    ).toContain('rules');
});
