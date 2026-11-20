import { expect, test } from 'bun:test';
import { managedSkillChangeText } from './managed-skill-notice.ts';

test('the notice names every updated skill and points shared changes at #all', () => {
    expect(managedSkillChangeText(['charts', 'visuals'])).toBe(
        '[Haus skill update: these Haus skills were updated: charts, visuals.] Re-read each before you next use it, and rebuild any scripts, notes, memory, or recipes you derived from it. If that changed something you rely on, post one short note in #all saying what you updated; otherwise do not post.'
    );
});
