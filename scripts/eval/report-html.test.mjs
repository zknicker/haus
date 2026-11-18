import { expect, test } from 'bun:test';
import { gradeBuild } from './grade.mjs';
import { renderMarkdown } from './markdown.mjs';
import { placementProfiles } from './profiles.mjs';
import { renderReportHtml } from './report-html.mjs';
import { summarizeEval } from './summary.mjs';
import { quickFactEvidence, temporaryRoot, writeRun } from './test-fixtures.mjs';

const scenarios = ['placement-quick-fact'];

async function buildReport({ notesMarkdown = null } = {}) {
    const root = await temporaryRoot();
    await writeRun(root, '20261015T100000', [
        { evidence: quickFactEvidence(), name: 'placement-quick-fact', ok: true },
    ]);
    await writeRun(root, '20261015T100500', [
        {
            error: 'AssertionError: result post placement: expected "inline-reply", got "top-level"',
            evidence: quickFactEvidence({
                channel: 'cht_baseline',
                inline: false,
                reply: '43447 <b>. Want me to restart it?',
            }),
            name: 'placement-quick-fact',
            ok: false,
        },
    ]);
    const grade = (stamp) =>
        gradeBuild({
            names: scenarios,
            profiles: placementProfiles,
            root,
            runs: [{ pass: 1, stamp }],
        });
    const grades = {
        baseline: await grade('20261015T100500'),
        change: await grade('20261015T100000'),
    };
    return {
        builds: {
            baseline: {
                infra: ['pass 2: the runner exited 1 without a run report'],
                leftovers: [],
                ref: '0123456789',
                runs: [],
            },
            change: {
                infra: [],
                leftovers: ['mounted /Users/x/.haus/dev/eval-placement-change/w'],
                ref: 'working tree @ abc',
                runs: [],
            },
        },
        description: 'Answers land where the asker looks.',
        eval: 'placement',
        generatedAt: '2026-10-15T12:00:00.000Z',
        grades,
        judge: { enabled: false, reason: 'no HAUS_TYPESAFE_API_KEY' },
        lanes: 3,
        model: 'codex/terra',
        notesMarkdown,
        passes: 1,
        scenarios,
        stamp: '20261015T120000',
        summary: summarizeEval({ grades, scenarios }),
    };
}

test('renders every section of the report', async () => {
    const html = renderReportHtml(
        await buildReport({ notesMarkdown: '1. **Rewrote** the `send` hint.' })
    );
    expect(html).toStartWith('<!doctype html>');
    expect(html).toContain('<title>Placement Eval</title>');
    expect(html).toContain('Placement: the change is 100 points better');
    expect(html).toContain('<h2>What was changed</h2>');
    expect(html).toContain('<li><strong>Rewrote</strong> the <code>send</code> hint.</li>');
    expect(html).toContain('<div class="n">1 of 1</div>');
    expect(html).toContain('<div class="n">0 of 1</div>');
    expect(html).toContain('<div class="n">+100 pts</div>');
    expect(html).toContain('<h2>Grader detail</h2>');
    expect(html).toContain('<h2>What the agent posted</h2>');
    expect(html).toContain('reply in channel');
    expect(html).toContain('channel, not a reply');
    expect(html).toContain('marked finished');
    expect(html).toContain('<h2>Caveats</h2>');
    expect(html).toContain('Judge: skipped (no HAUS_TYPESAFE_API_KEY).');
    expect(html).toContain('Baseline infra: pass 2: the runner exited 1 without a run report');
    expect(html).toContain('Change stack left behind: mounted');
    expect(html).toContain('@media (prefers-color-scheme: dark)');
    expect(html).not.toContain('<script');
    expect(html).toMatchSnapshot();
});

test('escapes message text and omits notes when none were given', async () => {
    const html = renderReportHtml(await buildReport());
    expect(html).toContain('43447 &lt;b&gt;. Want me to restart it?');
    expect(html).not.toContain('43447 <b>');
    expect(html).not.toContain('What was changed');
});

test('notes markdown never passes markup through', () => {
    expect(
        renderMarkdown('## Plan\n\n- a <script>x</script>\n- [doc](https://example.com/a?b=1&c=2)')
    ).toBe(
        '<h4>Plan</h4>\n<ul><li>a &lt;script&gt;x&lt;/script&gt;</li><li><a href="https://example.com/a?b=1&amp;c=2">doc</a></li></ul>'
    );
});
