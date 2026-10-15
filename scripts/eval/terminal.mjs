// Quiet live progress for `bun run eval`, in the dev stack's ANSI and glyph
// conventions (scripts/dev-stack-log-format.mjs). Color only on a TTY without
// NO_COLOR.

import { formatHausLine, theme } from '../dev-stack-log-format.mjs';
import { percent, rate } from './summary.mjs';

const reset = '\x1b[0m';
const nameColumn = 34;
const cellColumn = 30;

export function createTerminal({ env = process.env, stream = process.stdout } = {}) {
    const colorize = Boolean(stream.isTTY) && !env.NO_COLOR;
    const paint = (text, color) => (colorize ? `${color}${text}${reset}` : text);
    const line = (text = '') => stream.write(`${text}\n`);

    return {
        colorize,
        header({ baseline, lanes, model, name, passes, scenarios }) {
            const builds = baseline ? `change vs baseline ${baseline}` : 'change only';
            line(
                formatHausLine(
                    `eval ${name} · ${builds} · ${passes} pass(es) × ${scenarios} scenario(s) · ${lanes} lane(s) · model ${model ?? 'default'}`,
                    { color: theme.accent, colorize, icon: '🎰' }
                )
            );
        },
        step(build, message, tone = 'muted') {
            const icons = { danger: '✕', muted: '·', ok: '✓', warning: '◐' };
            line(`${paint(`${icons[tone]} ${build.padEnd(8)}`, theme[tone])} ${message}`);
        },
        settled({ infra, name, ok, reason, seconds }) {
            const [glyph, color] = infra
                ? ['⚠', theme.warning]
                : ok
                  ? ['✓', theme.ok]
                  : ['✗', theme.danger];
            const why = ok ? '' : `  ${paint(clip(reason, 90), theme.muted)}`;
            line(
                `    ${paint(glyph, color)} ${name.padEnd(nameColumn)}${String(seconds).padStart(4)}s${why}`
            );
        },
        table(summary) {
            line();
            const builds = summary.builds;
            const head = [
                pad('scenario', nameColumn),
                ...builds.map((build) => pad(build, cellColumn)),
            ];
            line(paint(`  ${head.join('')}`.trimEnd(), theme.muted));
            for (const row of summary.rows) {
                const cells = builds.map((build) => pad(cell(row[build]), cellColumn));
                line(`  ${pad(row.scenario, nameColumn)}${cells.join('')}`.trimEnd());
            }
            line(
                paint(
                    '  cells: runner pass · grader spec · mean words · judge; ⚠ infra runs left out',
                    theme.muted
                )
            );
        },
        verdict(summary) {
            const parts = ['change', 'baseline']
                .filter((build) => summary.totals[build])
                .map((build) => {
                    const total = summary.totals[build];
                    const infra = total.infra > 0 ? `, ⚠${total.infra} infra` : '';
                    return `${build} ${total.passed}/${total.graded} (${percent(rate(total))}${infra})`;
                });
            const { delta, tone } = summary.verdict;
            const color = { better: theme.ok, neutral: theme.muted, worse: theme.danger }[tone];
            const suffix =
                delta === null ? '' : ` · ${paint(`${delta > 0 ? '+' : ''}${delta} pts`, color)}`;
            line();
            line(`  ${paint('verdict', theme.accent)}  ${parts.join(' vs ')}${suffix}`);
        },
        report(file, note) {
            line(`  ${paint('report ', theme.accent)}  ${file}`);
            if (note) {
                line(`  ${paint(note, theme.muted)}`);
            }
        },
        error(message) {
            line(formatHausLine(message, { color: theme.danger, colorize, icon: '✕' }));
        },
    };
}

/** "2/3 · 1/3 · 41w · 4.2", with "⚠n" when infra runs were left out. */
export function cell(entry) {
    const infra = entry.infra > 0 ? ` ⚠${entry.infra}` : '';
    const spec = entry.specPassed === null ? '-' : `${entry.specPassed}/${entry.graded}`;
    const words = entry.words === null ? '-' : `${entry.words}w`;
    return `${entry.passed}/${entry.graded}${infra} · ${spec} · ${words} · ${entry.judge ?? '-'}`;
}

function pad(value, width) {
    return String(value).padEnd(width, ' ');
}

function clip(text, limit) {
    const value = String(text ?? '')
        .split('\n')[0]
        .replace(/^\w*Error:\s*/u, '');
    return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}
