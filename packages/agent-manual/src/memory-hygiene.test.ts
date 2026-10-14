import { expect, test } from 'bun:test';
import { getManualTopic } from './index.ts';

const body = getManualTopic('recipes/technique/memory-hygiene')?.body ?? '';
const dreaming = body.slice(body.indexOf('### Dreaming'), body.indexOf('### Verify'));

test('dreaming keeps standing rules, edits only memory, and checks claims about other Agents', () => {
    expect(dreaming).toContain('carries every Standing Preference forward');
    expect(dreaming).toContain('only MEMORY.md and notes/: no reminders, tasks, or messages');
    expect(dreaming).toContain("Another Agent's state is a claim");
    // Points at the existing failure mode instead of restating it.
    expect(dreaming).toContain('(see Memory as proof)');
    expect(body).toContain('**Memory as proof**');
});

test('dreaming re-reads all of MEMORY.md and may fix stale old notes', () => {
    expect(dreaming).toContain('Re-read all of MEMORY.md');
    expect(dreaming).toContain('old untouched notes included');
    expect(dreaming).toContain('Re-check each Active Context line is still true');
    expect(dreaming).not.toContain('changed since your last pass');
});

test('dreaming drops what a haus command can look up and keeps what is hard to re-derive', () => {
    expect(dreaming).toContain('Keep what is hard to re-derive');
    expect(dreaming).toContain("other Agents' status, task details, chat contents; keep a handle instead");
});

test('dates: no verification stamps or dated logs, real deadlines written absolute', () => {
    expect(body).toContain('No "verified <date>" stamps or dated log entries');
    expect(body).toContain('written absolute ("Oct 19", not "next Sunday")');
    expect(body).not.toContain('Never add date stamps');
    expect(dreaming).not.toContain('No dates.');
});

test('rules may carry a reason and record confirmed approaches', () => {
    expect(body).toContain('one short "because …" clause only when the reason isn\'t obvious');
    expect(body).toContain('Record confirmed approaches too, not only corrections');
    expect(body).toContain('not a vague label');
});
