import { expect, test } from 'bun:test';
import { getManualTopic } from './index.ts';

test('dreaming keeps standing rules, edits only memory, and checks claims about other Agents', () => {
    const body = getManualTopic('recipes/technique/memory-hygiene')?.body ?? '';
    const dreaming = body.slice(body.indexOf('### Dreaming'), body.indexOf('### Verify'));

    expect(dreaming).toContain('carries every Standing Preference forward');
    expect(dreaming).toContain('only MEMORY.md and notes/: no reminders, tasks, or messages');
    expect(dreaming).toContain("Other Agents' state is a claim");
    // Points at the existing failure mode instead of restating it.
    expect(dreaming).toContain('(see Memory as proof)');
    expect(body).toContain('**Memory as proof**');
});
