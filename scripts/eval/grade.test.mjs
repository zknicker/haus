import { expect, test } from 'bun:test';
import { gradeBuild, isInfraFailure } from './grade.mjs';
import { placementProfiles } from './profiles.mjs';
import { summarizeEval } from './summary.mjs';
import { quickFactEvidence, temporaryRoot, writeRun } from './test-fixtures.mjs';

const names = ['placement-quick-fact', 'ack-reaction-thanks', 'mention-wakes-only-addressed'];

async function gradeFixture(scenarios, stamp = '20261015T100000') {
    const root = await temporaryRoot();
    await writeRun(root, stamp, scenarios);
    return await gradeBuild({
        names,
        profiles: placementProfiles,
        root,
        runs: [{ pass: 1, stamp }],
    });
}

test('a focused inline --done reply passes every grader check and carries both flags', async () => {
    const [grade] = await gradeFixture([
        { evidence: quickFactEvidence(), name: 'placement-quick-fact', ok: true },
    ]);
    expect(grade.checks.filter((check) => !check.ok)).toEqual([]);
    expect(grade.result).toMatchObject({ label: 'inline-reply', words: 1 });
    expect(grade.finished).toBe(true);
    expect(grade.repliesToRequest).toBe(true);
    expect(grade.pass).toBe(1);
    expect(grade.timeline.map((entry) => entry.who)).toEqual(['human', 'human', 'agent']);
    expect(grade.timeline.at(-1)).toMatchObject({ finished: true, label: 'inline-reply' });
});

test('a top-level, over-cap answer with a tail fails the matching checks', async () => {
    const reply = `The dev server is on 43447 this week. ${'More detail. '.repeat(10)}Want me to restart it?`;
    const [grade] = await gradeFixture([
        {
            evidence: quickFactEvidence({ inline: false, reply }),
            name: 'placement-quick-fact',
            ok: false,
            error: 'AssertionError: result post placement: expected "inline-reply", got "top-level"',
        },
    ]);
    const failed = grade.checks.filter((check) => !check.ok).map((check) => check.name);
    expect(failed).toEqual(['no tail phrase', 'result is an inline reply', 'result <= 25 words']);
    expect(grade.tails).toEqual(['want me to']);
    expect(grade.infra).toBe(false);
});

test('infra failures are flagged, and unprofiled scenarios grade on the runner verdict', async () => {
    const grades = await gradeFixture([
        {
            error: 'Error: Agent @eval-worker1 never became ready within 300s (status=pending)',
            name: 'ack-reaction-thanks',
            ok: false,
        },
        { name: 'mention-wakes-only-addressed', ok: true },
        { name: 'not-in-this-eval', ok: true },
    ]);
    expect(grades.map((grade) => grade.scenario)).toEqual([
        'ack-reaction-thanks',
        'mention-wakes-only-addressed',
    ]);
    expect(grades[0].infra).toBe(true);
    expect(grades[1]).toMatchObject({ checks: [], infra: false, ok: true, spec: null });

    const summary = summarizeEval({ grades: { change: grades }, scenarios: names });
    expect(summary.totals.change).toEqual({ graded: 1, infra: 1, passed: 1, runs: 2 });
    expect(summary.verdict.delta).toBeNull();
});

test('a run missing its summary is skipped rather than invented', async () => {
    const root = await temporaryRoot();
    const grades = await gradeBuild({
        names,
        profiles: placementProfiles,
        root,
        runs: [{ pass: 1, stamp: '20261015T110000' }],
    });
    expect(grades).toEqual([]);
});

test('infra classification keeps behavioral assertion failures out', () => {
    expect(isInfraFailure('Error: fetch failed')).toBe(true);
    expect(
        isInfraFailure('Error: Execution journal for run run_1 stayed missing after 10 tries')
    ).toBe(true);
    expect(isInfraFailure('AssertionError: posts in the request thread: expected 0, got 1')).toBe(
        false
    );
    expect(isInfraFailure(null)).toBe(false);
});
