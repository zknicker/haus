import { expect, test } from 'bun:test';
import { getManualTopic } from './index.ts';

const body = getManualTopic('recipes/technique/memory-hygiene')?.body ?? '';
const dreaming = body.slice(body.indexOf('### Dreaming'), body.indexOf('### Verify'));

test('dreaming points at the heartbeat recipe instead of carrying the pass', () => {
    expect(dreaming).toContain('recipes/technique/heartbeat');
    expect(dreaming).toContain('Keep what is hard to re-derive');
    expect(dreaming.split('\n').length).toBeLessThan(5);
    expect(body).not.toContain('Edit memory only');
});

test('standing rules survive a MEMORY.md rewrite', () => {
    expect(body).toContain('carries every Standing Preference forward');
});

test('stale other-Agent state is a claim to check, via the Memory as proof failure mode', () => {
    expect(body).toContain('**Memory as proof**');
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
