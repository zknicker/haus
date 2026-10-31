// bun run eval <name> [--baseline <sha>] [--passes <n>] [--lanes <n>]
//                     [--model <runtime/model>] [--notes <file>] [--list]
//
// Runs a named eval (live agent-test scenarios plus grader profiles) against
// this checkout and, with --baseline, against that commit too; grades the runs
// and writes report.json plus report.html under .context/evals/<eval>/<stamp>/.
// Rates, not gates: exit 0 whenever the runs complete, 1 only on infra failure.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runStamp } from '../agent-tests/report.mjs';
import { parseEvalArgs, UsageError } from './args.mjs';
import { git, prepareBaseline } from './baseline.mjs';
import { evals, resolveEval } from './evals.mjs';
import { gradeBuild } from './grade.mjs';
import { judgeEnabled } from './judge.mjs';
import { renderReportHtml } from './report-html.mjs';
import { runBuild } from './run.mjs';
import { summarizeEval } from './summary.mjs';
import { createTerminal } from './terminal.mjs';

const changeRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const defaultLanes = 3;

const terminal = createTerminal();
const code = await main(process.argv.slice(2)).catch((error) => {
    terminal.error(error instanceof UsageError ? error.message : String(error.stack ?? error));
    return error instanceof UsageError ? 2 : 1;
});
// Eval children may retain connection timers; this process is done.
setTimeout(() => process.exit(code), 0);

async function main(argv) {
    const options = parseEvalArgs(argv);
    if (options.list) {
        for (const [name, entry] of Object.entries(evals)) {
            process.stdout.write(
                `  ${name.padEnd(12)}${String(entry.scenarios.length).padStart(3)} scenario(s)  ${entry.summary}\n`
            );
        }
        return 0;
    }
    const entry = resolveEval(options.name);
    const lanes = options.lanes ?? entry.lanes ?? defaultLanes;
    const stamp = runStamp();
    const outDir = path.join(changeRoot, '.context', 'evals', entry.name, stamp);
    await mkdir(outDir, { recursive: true });
    const notesMarkdown = options.notes
        ? await readFile(path.resolve(options.notes), 'utf8')
        : null;
    terminal.header({
        baseline: options.baseline,
        lanes,
        model: options.model?.label,
        name: entry.name,
        passes: options.passes,
        scenarios: entry.scenarios.length,
    });

    const run = {
        lanes,
        model: options.model,
        outDir,
        passes: options.passes,
        scenarios: entry.scenarios,
        terminal,
    };
    const builds = {
        change: {
            ref: `working tree @ ${git(changeRoot, ['rev-parse', '--short=10', 'HEAD'])}`,
            root: changeRoot,
            ...(await runBuild({
                ...run,
                build: 'change',
                root: changeRoot,
                stackId: `eval-${entry.name}-change`,
            })),
        },
    };
    if (options.baseline) {
        builds.baseline = await runBaseline({ entry, options, run });
    }

    const grades = {};
    for (const [build, info] of Object.entries(builds)) {
        if (!info.root) {
            grades[build] = [];
            continue;
        }
        grades[build] = await gradeBuild({
            judge: entry.judge,
            names: entry.scenarios,
            profiles: entry.profiles,
            root: info.root,
            runs: info.runs,
        });
    }
    const summary = summarizeEval({ grades, scenarios: entry.scenarios });
    const report = {
        builds,
        description: entry.summary,
        eval: entry.name,
        generatedAt: new Date().toISOString(),
        grades,
        judge: judgeState(entry.judge),
        lanes,
        model: options.model?.label ?? null,
        notesMarkdown,
        passes: options.passes,
        scenarios: entry.scenarios,
        stamp,
        summary,
    };
    await writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    const htmlFile = path.join(outDir, 'report.html');
    await writeFile(htmlFile, renderReportHtml(report));

    terminal.table(summary);
    terminal.verdict(summary);
    terminal.report(
        path.relative(process.cwd(), htmlFile),
        report.judge.enabled ? null : `judge skipped: ${report.judge.reason}`
    );
    const infra = Object.values(builds).some((info) => info.infra.length > 0);
    return infra ? 1 : 0;
}

async function runBaseline({ entry, options, run }) {
    let plan;
    try {
        plan = prepareBaseline({
            changeRoot,
            evalName: entry.name,
            log: (message) => terminal.step('baseline', message),
            revision: options.baseline,
        });
    } catch (error) {
        terminal.step('baseline', String(error.message ?? error), 'danger');
        return {
            infra: [String(error.message ?? error)],
            leftovers: [],
            ref: options.baseline,
            root: null,
            runs: [],
        };
    }
    return {
        ref: plan.short,
        root: plan.root,
        ...(await runBuild({ ...run, build: 'baseline', root: plan.root, stackId: plan.stackId })),
    };
}

function judgeState(spec) {
    if (!spec) {
        return { enabled: false, reason: 'this eval has no judge question' };
    }
    return judgeEnabled(spec)
        ? { enabled: true, reason: null }
        : { enabled: false, reason: 'no HAUS_TYPESAFE_API_KEY' };
}
