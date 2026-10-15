// Turns per-run grades into rates: per scenario per build, build totals, and
// the one-line verdict. Infra failures are counted but kept out of the rate's
// denominator, since they measure the stack, not the Agent.

/** Display order: the baseline reads first, the change against it. */
export const buildOrder = ['baseline', 'change'];

/** Rates for one scenario in one build. */
export function summarizeScenario(grades) {
    const behavioral = grades.filter((grade) => !grade.infra);
    const words = behavioral.map((grade) => grade.result?.words).filter(isNumber);
    const judged = behavioral.map((grade) => grade.judge?.score).filter(isNumber);
    const profiled = behavioral.filter((grade) => grade.spec !== null);
    return {
        failureCauses: failureCauses(behavioral),
        graded: behavioral.length,
        infra: grades.length - behavioral.length,
        judge: judged.length > 0 ? mean(judged) : null,
        passed: behavioral.filter((grade) => grade.ok).length,
        runs: grades.length,
        specPassed:
            profiled.length > 0
                ? profiled.filter((grade) => grade.checks.every((check) => check.ok)).length
                : null,
        tails: behavioral.reduce((sum, grade) => sum + (grade.tails?.length ?? 0), 0),
        words: words.length > 0 ? mean(words) : null,
    };
}

/** Scenario rows, build totals, and the verdict for a graded eval. */
export function summarizeEval({ grades, scenarios }) {
    const builds = buildOrder.filter((build) => grades[build]);
    const rows = scenarios.map((scenario) => ({
        scenario,
        spec:
            builds
                .flatMap((build) => grades[build])
                .find((grade) => grade.scenario === scenario && grade.spec)?.spec ?? null,
        ...Object.fromEntries(
            builds.map((build) => [
                build,
                summarizeScenario(grades[build].filter((grade) => grade.scenario === scenario)),
            ])
        ),
    }));
    const totals = Object.fromEntries(
        builds.map((build) => [build, totalOf(rows.map((row) => row[build]))])
    );
    return { builds, rows, totals, verdict: verdictOf(totals) };
}

/** The run that best represents a build: first one matching its majority verdict. */
export function representative(grades) {
    const behavioral = grades.filter((grade) => !grade.infra);
    const passes = behavioral.filter((grade) => grade.ok).length;
    const majority = behavioral.length > 0 && passes * 2 >= behavioral.length;
    return (
        behavioral.find((grade) => grade.ok === majority && grade.timeline?.length) ??
        grades.find((grade) => grade.timeline?.length) ??
        grades[0] ??
        null
    );
}

export function rate(total) {
    return total.graded > 0 ? total.passed / total.graded : null;
}

export function percent(value) {
    return value === null ? '-' : `${Math.round(value * 100)}%`;
}

function totalOf(summaries) {
    return summaries.reduce(
        (sum, entry) => ({
            graded: sum.graded + entry.graded,
            infra: sum.infra + entry.infra,
            passed: sum.passed + entry.passed,
            runs: sum.runs + entry.runs,
        }),
        { graded: 0, infra: 0, passed: 0, runs: 0 }
    );
}

function verdictOf(totals) {
    const change = totals.change ? rate(totals.change) : null;
    const baseline = totals.baseline ? rate(totals.baseline) : null;
    if (change === null || baseline === null) {
        return { delta: null, tone: 'neutral' };
    }
    const delta = Math.round((change - baseline) * 100);
    return { delta, tone: delta > 0 ? 'better' : delta < 0 ? 'worse' : 'neutral' };
}

/** Failed grader checks and runner errors, most common first. */
function failureCauses(grades) {
    const counts = new Map();
    for (const grade of grades) {
        const causes = new Set(
            grade.checks.filter((check) => !check.ok).map((check) => check.name)
        );
        if (!grade.ok && grade.error) {
            causes.add(runnerCause(grade.error));
        }
        for (const cause of causes) {
            counts.set(cause, (counts.get(cause) ?? 0) + 1);
        }
    }
    return [...counts.entries()]
        .sort((left, right) => right[1] - left[1])
        .map(([cause, count]) => ({ cause, count }));
}

/** The assertion label of a runner error: "AssertionError: label: expected …" → "label". */
export function runnerCause(error) {
    const line = String(error)
        .split('\n')[0]
        .replace(/^\w*Error:\s*/u, '');
    const label = line.split(/:\s+expected\b/u)[0];
    return label.length > 90 ? `${label.slice(0, 89)}…` : label;
}

function mean(numbers) {
    return Math.round((numbers.reduce((sum, value) => sum + value, 0) / numbers.length) * 10) / 10;
}

function isNumber(value) {
    return typeof value === 'number';
}
