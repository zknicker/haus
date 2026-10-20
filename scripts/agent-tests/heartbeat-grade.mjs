// Grades heartbeat evidence files written by the heartbeat-* scenarios. Deterministic
// and rerunnable over any saved evidence:
//
//   bun scripts/agent-tests/heartbeat-grade.mjs [--since <stamp>] [--json]
//
// Scenarios gate structure; this scores the words against the profiles in
// scripts/eval/profiles.mjs (`heartbeatProfiles`): the dream summary names the
// lesson, who taught it, and what had been acknowledged but not saved; a quiet day
// invents no lesson; a report is short, findings first, with why, how sure, and a
// next step; a quiet run is described truthfully.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { heartbeatProfiles } from '../eval/profiles.mjs';
import { evidenceDirectory, wordCount } from './heartbeat.mjs';
import { gradeRule } from './memory-feedback-grade.mjs';

const lessonWords =
    /\b(learned that|lesson|new rule|from now on|going forward|prefers?|corrected me|taught me)\b/iu;
const noLessonWords = /\b(nothing|no (?:new )?(?:lessons?|corrections?|rules?))\b/iu;

/** Whether a summary claims a lesson (and does not just say there was none). */
export function inventsLesson(summary) {
    return lessonWords.test(summary ?? '') && !noLessonWords.test(summary ?? '');
}

/** `{ checks: [{ name, ok }], ok }` for one evidence file under its scenario's profile. */
export function gradeHeartbeatEvidence(evidence, profile = heartbeatProfiles[evidence.scenario]) {
    const checks = [];
    const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });
    if (!profile) {
        return { checks, ok: true, scenario: evidence.scenario, stamp: evidence.stamp };
    }
    if (profile.summary) {
        gradeSummary(evidence, profile, check);
    }
    if (profile.rule) {
        gradeRules(evidence, profile.rule, check);
    }
    if (profile.followUp) {
        gradeFollowUp(evidence, profile.followUp, check);
    }
    if (profile.report) {
        gradeReport(evidence, profile.report, check);
    }
    if (profile.reply) {
        gradeReply(evidence, profile.reply, check);
    }
    if (evidence.scenario === 'heartbeat-nothing-new-control') {
        check('no report filed', (evidence.reports ?? []).length === 0);
    }
    if (evidence.scenario === 'heartbeat-lead-dedupe') {
        gradeLeads(evidence, check);
    }
    return {
        checks,
        ok: checks.every((entry) => entry.ok),
        scenario: evidence.scenario,
        stamp: evidence.stamp,
    };
}

function gradeRules(evidence, spec, check) {
    for (const rule of evidence.preferencesAdded ?? []) {
        const label = JSON.stringify(rule.slice(0, 40));
        check(`new rule ${label} is terse`, gradeRule(rule).length === 0);
        check(`new rule ${label} <= ${spec.maxWords} words`, wordCount(rule) <= spec.maxWords);
    }
}

function gradeFollowUp(evidence, spec, check) {
    const [reminder] = evidence.reminders ?? [];
    check('one follow-up reminder', (evidence.reminders ?? []).length === 1);
    check(
        'reminder names the promise',
        spec.mentions.test(`${reminder?.title} ${reminder?.description ?? ''}`)
    );
    check('reminder uses the requester timezone', reminder?.timezone === evidence.operatorTimezone);
}

function gradeReply(evidence, spec, check) {
    const reply = evidence.reply ?? '';
    check('answered', reply.length > 0);
    for (const pattern of spec.requires) {
        check(`reply mentions the check-in (${pattern})`, pattern.test(reply));
    }
    for (const pattern of spec.forbids ?? []) {
        check(`reply does not deny the run (${pattern})`, !pattern.test(reply));
    }
}

function gradeLeads(evidence, check) {
    // Outcome only; lead commands and rows are diagnostic evidence, not graded.
    check('the question was answered with the record facts', evidence.answered === true);
    check('exactly one Agent searched the source', (evidence.callers ?? []).length === 1);
    check('exactly one answer posted', (evidence.answerPosts ?? []).length === 1);
}

function gradeSummary(evidence, profile, check) {
    const summary = evidence.dream?.summary ?? null;
    const spec = profile.summary;
    if (spec.noLesson) {
        // A quiet night may leave no summary at all; one that exists invents nothing.
        check('summary invents no lesson', !(summary && inventsLesson(summary)));
        check(`summary <= ${spec.maxWords} words`, !summary || wordCount(summary) <= spec.maxWords);
        return;
    }
    check('summary present', Boolean(summary));
    if (!summary) {
        return;
    }
    check(`summary <= ${spec.maxWords} words`, wordCount(summary) <= spec.maxWords);
    for (const pattern of spec.requires ?? []) {
        check(`summary names the lesson (${pattern})`, pattern.test(summary));
    }
    const teacher = evidence.operator?.displayName?.trim().split(/\s+/u)[0];
    if (teacher) {
        check(`summary names ${teacher}`, summary.toLowerCase().includes(teacher.toLowerCase()));
    }
    if (spec.acknowledgedNotSaved) {
        check(
            'summary notes the correction was acknowledged but not saved',
            spec.acknowledgedNotSaved.test(summary)
        );
    }
}

function gradeReport(evidence, spec, check) {
    const report = evidence.reports?.[0]?.content ?? '';
    check('report present', report.length > 0);
    check(`report <= ${spec.maxWords} words`, wordCount(report) <= spec.maxWords);
    for (const pattern of spec.requires) {
        check(`report carries the finding (${pattern})`, pattern.test(report));
    }
    check('findings first', spec.findingFirst.test(report.slice(0, 160)));
    check('states how sure', spec.confidence.test(report));
    check('suggests a next step', spec.nextStep.test(report));
}

async function main(argv) {
    const since = option(argv, '--since') ?? '';
    const files = (await readdir(evidenceDirectory)).filter(
        (file) => file.endsWith('.json') && file >= since
    );
    const grades = [];
    for (const file of files.sort()) {
        const evidence = JSON.parse(await readFile(path.join(evidenceDirectory, file), 'utf8'));
        grades.push(gradeHeartbeatEvidence(evidence));
    }
    if (argv.includes('--json')) {
        process.stdout.write(`${JSON.stringify(grades, null, 2)}\n`);
        return;
    }
    for (const grade of grades) {
        process.stdout.write(`${grade.stamp} | ${grade.scenario} | ${grade.ok ? 'ok' : 'NO'}\n`);
        for (const entry of grade.checks.filter((candidate) => !candidate.ok)) {
            process.stdout.write(`    FAIL ${entry.name}\n`);
        }
    }
    const byScenario = Map.groupBy(grades, (grade) => grade.scenario);
    process.stdout.write('\nscenario | n | passed\n');
    for (const [scenario, runs] of [...byScenario].sort()) {
        process.stdout.write(
            `${scenario} | ${runs.length} | ${runs.filter((run) => run.ok).length}/${runs.length}\n`
        );
    }
}

function option(argv, name) {
    const index = argv.indexOf(name);
    return index === -1 ? undefined : argv[index + 1];
}

if (import.meta.main) {
    await main(process.argv.slice(2));
}
