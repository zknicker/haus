import { expect, test } from 'bun:test';
import { getManualTopic } from './index.ts';

const topic = getManualTopic('recipes/technique/heartbeat');
const body = topic?.body ?? '';

test('heartbeat is a query-tier technique recipe', () => {
    expect(topic).toMatchObject({
        class: 'technique',
        id: 'recipes/technique/heartbeat',
        tier: 'query',
    });
});

test('teaches the wire commands', () => {
    expect(body).toContain('haus message read --target <t> --after <seq>');
    expect(body).toContain('haus heartbeat report --text');
    expect(body).toContain('haus heartbeat learned --text');
    expect(body).toContain('haus lead claim --topic');
    expect(body).toContain('haus lead list');
    expect(body).toContain('haus lead done --id <id> --finding');
    expect(body).toContain('haus reminder schedule');
    expect(body).toContain('--message-id');
});

test('carries the checkpoint paths and the quiet rules', () => {
    expect(body).toContain('heartbeat/checkpoints/<YYYY-MM-DD>/<HH-mm>.md');
    expect(body).toContain('heartbeat/daily/<YYYY-MM-DD>.md');
    expect(body).toContain('Post nothing in any chat. One report or silence.');
    expect(body).toContain('Daytime runs never edit MEMORY.md');
    expect(body).toContain('Never repeat a finding the checkpoint says you reported');
});

test('nightly reflects with evidence and follows up promises', () => {
    expect(body).toContain("Check the other Agent's actual state before calling a handoff dropped");
    expect(body).toContain('One remark is one data point');
    expect(body).toContain('Look the timezone up; do not infer it');
    expect(body).toContain('The description says what was promised');
    expect(body).toContain('naming who taught you each lesson');
    expect(body).toContain('recipes/technique/memory-hygiene');
});
