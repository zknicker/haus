import { expect, test } from 'bun:test';
import {
    agentRuleLines,
    gradeEvidence,
    gradeRule,
    standingPreferences,
} from './memory-feedback-grade.mjs';

test('reads Standing Preferences lines without bullets', () => {
    const memory =
        '# A\n\n## Standing Preferences\n\n- Use metric units.\n- High agency.\n\n## Active Context\n\n- None.\n';
    expect(standingPreferences(memory)).toEqual(['Use metric units.', 'High agency.']);
});

test('passes a terse imperative rule', () => {
    expect(gradeRule('Take routine next steps without asking first.')).toEqual([]);
});

test('flags deltas, compound rules, and sourced records', () => {
    expect(gradeRule('Be tighter; do routine next steps without asking.')).toEqual([
        'compound: two rules in one line',
        'delta: "tighter"',
    ]);
    expect(gradeRule('Lead with the answer (reinforced by @dana).')).toEqual([
        'sourced: "reinforc"',
    ]);
});

const seeded =
    '# A\n\n## Standing Preferences\n\n- Keep replies short; lead with the answer.\n- Use metric units.\n\n## Active Context\n\n- None.\n';
const evidence = (memory, agentRules) => ({
    agent: { modelId: 'model', runtimeId: 'codex' },
    agentRules: { afterFeedback: agentRules, afterProbe: agentRules },
    memory: { afterFeedback: memory, afterProbe: memory, seeded },
    replies: { probe: ['Rotate the password now and scrub the CI log.'] },
    stamp: '20261120000000',
    variant: 'implicit',
});

test('reads rule lines from AGENTS.md, skipping headings', () => {
    expect(agentRuleLines('# Rules\n\n- Answer narrowly.\n* Proceed without asking.\n')).toEqual([
        'Answer narrowly.',
        'Proceed without asking.',
    ]);
    expect(agentRuleLines(null)).toEqual([]);
});

test('feedback filed in the Agent’s AGENTS.md counts as captured', () => {
    const moved = seeded.replace('- Keep replies short; lead with the answer.\n', '');
    const grade = gradeEvidence(
        evidence(
            moved,
            '# Rules\n\n- Keep answers tight and focused.\n- Take routine next steps without asking.\n'
        )
    );
    expect(grade.captured).toBe(true);
    expect(grade.merge).toBe(true);
    expect(gradeEvidence(evidence(seeded, null)).captured).toBe(false);
});

test('the same brevity rule in both files fails merge', () => {
    const grade = gradeEvidence(
        evidence(
            seeded,
            '- Keep answers tight and focused.\n- Take routine next steps without asking.\n'
        )
    );
    expect(grade.merge).toBe(false);
});
