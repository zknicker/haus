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
    expect(body).toContain("haus heartbeat report <<'HAUSMSG'");
    expect(body).toContain("haus heartbeat learned <<'HAUSMSG'");
    expect(body).not.toContain('--text');
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
    expect(body).toContain('the asker has heard nothing until your main session replies there');
    expect(body).toContain('Never resend a finding a past report already carried');
    expect(body).toContain(
        'Report what needs you or someone you work for and is still unhandled; that it has not changed, or an earlier run kept quiet, is no reason to stay quiet.'
    );
});

test('nightly reflects with evidence and follows up promises', () => {
    expect(body).toContain("Check the other Agent's actual state before calling a handoff dropped");
    expect(body).toContain('One remark is one data point');
    expect(body).toContain('Look the timezone up; do not infer it');
    expect(body).toContain('The description says what was promised');
    expect(body).toContain('each naming who taught it');
    expect(body).toContain('what MEMORY.md held when the run started');
    expect(body).toContain('acknowledged but not saved until now');
    expect(body).toContain('recipes/technique/memory-hygiene');
});

test('the learned summary is written only for real lessons, never invented', () => {
    expect(body).toContain('Write the summary only when there are real lessons');
    expect(body).toContain('1–4 lines');
    expect(body).toContain('skip `haus heartbeat learned` entirely');
    expect(body).toContain('never invent a lesson');
});

test('the turn input carries the checkpoint, leads, reminders, and connections, and the run does not read back', () => {
    expect(body).toContain('The latest checkpoint is in the turn input; do not fetch it again');
    expect(body).toContain('Your connection names are in the turn input; do not search for them');
    expect(body).toContain('The open leads and your open reminders are in the turn input');
    expect(body).toContain('so do not read it back');
    expect(body).not.toContain('The checkpoint exists at the path above');
    expect(body).toContain('re-reading it wastes the run');
});
