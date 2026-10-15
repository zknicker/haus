// Renders an eval's report.json as one self-contained HTML page: headline
// tiles, pass-rate bars, the grader table, representative transcripts, the
// optional "what was changed" notes, and caveats. No scripts.

import { escapeHtml, renderMarkdown } from './markdown.mjs';
import { reportCss, reportFonts } from './report-style.mjs';
import { renderTranscripts } from './report-transcripts.mjs';
import { percent, rate } from './summary.mjs';

export function renderReportHtml(report) {
    const { builds } = report.summary;
    const labels = buildLabels(report);
    const sections = [
        renderHeader(report, labels),
        report.notesMarkdown ? renderNotes(report.notesMarkdown) : '',
        renderResults(report, labels),
        renderGraderTable(report, labels),
        `<section>\n<h2>What the agent posted</h2>\n<p>One representative run per build: the first whose runner verdict matches that build's majority. Grey indented lines are inside a Thread; badges say where each post landed.</p>\n${renderTranscripts({ builds, grades: report.grades, labels, scenarios: report.scenarios })}\n</section>`,
        renderCaveats(report, labels),
    ].filter(Boolean);
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(titleCase(report.eval))} Eval</title>
<link rel="stylesheet" href="${reportFonts}">
<style>${reportCss}</style>
</head>
<body>
<main>
${sections.join('\n\n')}
</main>
</body>
</html>
`;
}

export function buildLabels(report) {
    return Object.fromEntries(
        report.summary.builds.map((build) => [build, build === 'change' ? 'Change' : 'Baseline'])
    );
}

function renderHeader(report, labels) {
    const date = new Date(report.generatedAt).toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
    const builds = report.summary.builds
        .map((build) => `${labels[build]}: ${report.builds[build].ref}`)
        .join(' · ');
    const model = report.model ? ` · model ${report.model}` : '';
    return `<header>
  <div class="eyebrow">Haus · ${escapeHtml(report.eval)} eval · ${escapeHtml(date)}</div>
  <h1>${escapeHtml(headline(report))}</h1>
  <p class="lede">${escapeHtml(report.description ?? '')}</p>
  <p class="lede">${escapeHtml(`${builds} · ${report.passes} ${report.passes === 1 ? 'pass' : 'passes'} × ${report.scenarios.length} scenarios${model}`)}</p>
</header>`;
}

function headline({ eval: name, summary }) {
    const { delta } = summary.verdict;
    if (delta === null) {
        return `${titleCase(name)} eval`;
    }
    if (delta === 0) {
        return `${titleCase(name)}: the change matches the baseline`;
    }
    return `${titleCase(name)}: the change is ${Math.abs(delta)} points ${delta > 0 ? 'better' : 'worse'}`;
}

function renderNotes(markdown) {
    return `<section class="notes">\n<h2>What was changed</h2>\n${renderMarkdown(markdown)}\n</section>`;
}

function renderResults(report, labels) {
    const { builds, rows, totals, verdict } = report.summary;
    const tiles = builds.map((build) => {
        const total = totals[build];
        const tone =
            build === 'change' && verdict.tone !== 'neutral' ? toneClass(verdict.tone) : '';
        const infra = total.infra > 0 ? ` ${total.infra} infra failure(s) left out.` : '';
        return `<div class="kpi${tone}"><div class="n">${total.passed} of ${total.graded}</div><div class="l">${escapeHtml(`${labels[build]} (${report.builds[build].ref}), ${percent(rate(total))}.${infra}`)}</div></div>`;
    });
    if (verdict.delta !== null) {
        const sign = verdict.delta > 0 ? '+' : '';
        tiles.push(
            `<div class="kpi${toneClass(verdict.tone)}"><div class="n">${sign}${verdict.delta} pts</div><div class="l">Change pass rate minus baseline.</div></div>`
        );
    }
    const bars = rows.map((row) => {
        const tracks = builds.map((build) => {
            const entry = row[build];
            const fillClass = build === 'baseline' ? 'base' : changeFill(row);
            const width = Math.round((rate(entry) ?? 0) * 100);
            const infra = entry.infra > 0 ? ` ⚠${entry.infra}` : '';
            return `<div class="track"><span class="who">${labels[build].toLowerCase()}</span><div class="rail"><div class="fill ${fillClass}" style="width:${width}%"></div></div><span class="v">${entry.passed}/${entry.graded}${infra}</span></div>`;
        });
        const spec = row.spec ? `<small>${escapeHtml(row.spec)}</small>` : '';
        return `<div class="bar-row"><div class="lab">${escapeHtml(row.scenario)}${spec}</div><div class="tracks">\n${tracks.join('\n')}</div></div>`;
    });
    return `<section>
<h2>Results</h2>
<div class="kpis">
${tiles.join('\n')}
</div>
<h3 style="margin-top:20px">Pass rate by scenario</h3>
<div class="bars">
${bars.join('\n')}
</div>
<p style="margin-top:12px;font-size:14px;color:var(--muted)">Pass is the live runner's structural verdict. Infra failures (⚠) are counted in caveats and left out of the rate.</p>
</section>`;
}

function renderGraderTable(report, labels) {
    const { builds, rows } = report.summary;
    const body = rows.flatMap((row) =>
        builds.map((build, index) => {
            const entry = row[build];
            const name =
                index === 0
                    ? `<td rowspan="${builds.length}">${escapeHtml(row.scenario)}${row.spec ? `<small>${escapeHtml(row.spec)}</small>` : ''}</td>`
                    : '';
            const causes = entry.failureCauses
                .map((cause) => `${cause.cause}${cause.count > 1 ? ` ×${cause.count}` : ''}`)
                .join('; ');
            return `<tr>${name}<td>${labels[build]}</td><td class="num">${entry.passed}/${entry.graded}</td><td class="num">${entry.specPassed === null ? '-' : `${entry.specPassed}/${entry.graded}`}</td><td class="num">${entry.words ?? '-'}</td><td class="num">${entry.tails}</td><td class="num">${entry.judge ?? '-'}</td><td class="causes">${escapeHtml(causes || '-')}</td></tr>`;
        })
    );
    return `<section>
<h2>Grader detail</h2>
<p>Spec is the out-of-band grader: every structural check plus word cap, tails, and questions. Words is the mean length of the graded result post; tails counts offer phrases across runs; judge is the mean Jev score (1-5, pass bar 4).</p>
<div class="table-wrap"><table>
<thead><tr><th>Scenario</th><th>Build</th><th>Runner</th><th>Spec</th><th>Words</th><th>Tails</th><th>Judge</th><th>Failure causes</th></tr></thead>
<tbody>
${body.join('\n')}
</tbody>
</table></div>
</section>`;
}

function renderCaveats(report, labels) {
    const items = [
        `n = ${report.passes} pass(es) per build × ${report.scenarios.length} scenario(s). Agents are not deterministic; small n is weak evidence.`,
        report.judge.enabled
            ? 'Judge: Jev, 1-5, pass bar 4.'
            : `Judge: skipped (${report.judge.reason}).`,
    ];
    for (const build of report.summary.builds) {
        const info = report.builds[build];
        for (const failure of info.infra ?? []) {
            items.push(`${labels[build]} infra: ${failure}`);
        }
        for (const grade of report.grades[build].filter((entry) => entry.infra)) {
            items.push(
                `${labels[build]} pass ${grade.pass}, ${grade.scenario}: ${String(grade.error).split('\n')[0]}`
            );
        }
        for (const leftover of info.leftovers ?? []) {
            items.push(`${labels[build]} stack left behind: ${leftover}`);
        }
    }
    return `<section>\n<h2>Caveats</h2>\n<ul class="caveats">\n${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n')}\n</ul>\n</section>`;
}

function changeFill(row) {
    if (!row.baseline) {
        return 'better';
    }
    const change = rate(row.change);
    const baseline = rate(row.baseline);
    return change !== null && baseline !== null && change < baseline ? 'worse' : 'better';
}

function toneClass(tone) {
    return tone === 'better' ? ' good' : tone === 'worse' ? ' bad' : '';
}

function titleCase(value) {
    return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
