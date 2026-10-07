import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentExecutionJournal, AgentExecutionJournalTool } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import { TurnTracePresentation } from './turn-trace.tsx';
import { TurnTraceCallBody } from './turn-trace-call-body.tsx';
import { complexTurn } from './turn-trace-claude-fixtures.ts';
import { codexFailureTurn, imageTurn } from './turn-trace-codex-fixtures.ts';
import { TurnTraceScopeProvider } from './turn-trace-scope.tsx';
import { TurnTraceSteps } from './turn-trace-steps-view.tsx';
import { buildTurnTraceView } from './turn-trace-view.ts';

test('TurnTrace tells a member where execution detail lives', () => {
    const markup = render({ access: 'summary', presentation: null });

    assert.match(markup, /Execution details are available to owners and admins\./);
    assert.doesNotMatch(markup, /data-trace-anchor|Started work/);
});

test('TurnTrace states why a journal could not be read without hiding the turn', () => {
    const markup = render({
        presentation: {
            description: 'The assigned Computer is offline. Try again when it is online.',
            kind: 'offline',
            title: 'Detailed activity unavailable offline',
        },
    });

    assert.match(markup, /Detailed activity unavailable offline/);
    assert.doesNotMatch(markup, /Started work/);
});

test('TurnTrace does not flash a loading label or semantic replacement while the first relay is pending', () => {
    const markup = renderToStaticMarkup(
        <TurnTracePresentation access="journal" isPending presentation={null} />
    );
    assert.doesNotMatch(markup, /Loading|Started work|No activity/);
});

test('reasoning is a one-line row, its first line as detail, even before the first tool', () => {
    const markup = renderJournal({
        ...journal([]),
        reasoning: [{ id: 'thinking', startedAt: at(1), text: 'Inspecting the delivery queue.' }],
        status: 'running',
    });

    assert.match(markup, /data-trace-row/);
    assert.match(
        markup,
        />Thought<[\s\S]*?class="[^"]*text-muted">Inspecting the delivery queue\.</
    );
    // Closed like every other step; its prose mounts only once opened.
    assert.match(markup, /aria-expanded="false"/);
    assert.doesNotMatch(markup, /chat-markdown/);
});

test('the trace is one grid of borderless rows with totals stated once, in its footer', () => {
    const markup = renderJournal(complexTurn);

    // Rows on the trace grid, not a stack of bordered ChatTool cards.
    assert.match(markup, /data-trace-row/);
    assert.doesNotMatch(markup, /class="chat-tool\b/);
    const footer = markup.slice(markup.indexOf('data-trace-footer'));
    assert.match(footer, /data-trace-stat="Calls"[\s\S]*?>12<\/dd>/);
    assert.match(footer, /data-trace-stat="Sub-agents"[\s\S]*?>3<\/dd>/);
    assert.match(footer, /data-trace-stat="Failed"[\s\S]*?text-danger[^"]*">3<\/dd>/);
    assert.match(footer, /data-trace-stat="Done"[\s\S]*?>1m 25s<\/dd>/);
    // Durations sit in one right-aligned tabular column; a sub-second leaf states none.
    assert.match(
        markup,
        /class="whitespace-nowrap text-end text-muted text-sm tabular-nums" data-trace-cell="duration">19s</
    );
    assert.doesNotMatch(markup, />\d+ms</);
});

test('steps are tab stops only when they open to something', () => {
    const markup = renderJournal(
        journal([
            tool({ toolCallId: 'call-bare', toolName: 'mystery_tool' }),
            tool({ input: { command: 'bun test' }, toolCallId: 'call-shell' }),
        ])
    );

    const buttons = markup.match(/<button[^>]*>/g) ?? [];
    assert.equal(buttons.length, 1);
    assert.match(buttons[0] ?? '', /data-trace-row/);
    assert.match(buttons[0] ?? '', /aria-expanded="false"/);
    // The bare call is still a row, just not a control.
    assert.match(markup, /Used mystery_tool/);
    // Only that trigger takes focus; rows, rails, and bars carry no tabindex.
    assert.equal(markup.match(/tabindex="0"/g)?.length, 1);
});

test('same-kind runs fold into one expandable row, and parallel runs say so', () => {
    const markup = renderJournal(codexFailureTurn);

    assert.match(markup, /aria-expanded="false"[^>]*>[\s\S]*?Ran sleep 45 &amp;&amp; echo done ×5/);
    assert.match(markup, /in parallel/);
    // Five lanes drawn inside the fold's one bar.
    assert.equal(markup.match(/height:calc\(20% - 1px\)/g)?.length, 5);
});

test('Haus bookkeeping is one muted row', () => {
    const markup = renderJournal(complexTurn);

    assert.equal(markup.match(/Haus bookkeeping/g)?.length, 1);
    assert.match(markup, /2 steps/);
    assert.doesNotMatch(markup, /text-foreground">Haus bookkeeping/);
});

test('a sub-agent that finished with failed calls warns and counts them', () => {
    const markup = renderJournal(complexTurn);

    assert.match(markup, /text-warning/);
    assert.match(markup, /Ran sub-agent: Security review/);
    assert.match(markup, /<span class="shrink-0 text-danger tabular-nums">2 failed<\/span>/);
});

test('a failed row tints but stays closed until someone opens it', () => {
    const markup = renderJournal(codexFailureTurn);

    assert.doesNotMatch(markup, /aria-expanded="true"/);
    const failed = markup.match(/<button[^>]*bg-trace-row-danger[^>]*>/)?.[0] ?? '';
    assert.match(failed, /aria-expanded="false"/);
});

test('a failed command opens to its reason, then its output, with nothing behind a second press', () => {
    const view = buildTurnTraceView(
        codexFailureTurn,
        [],
        Date.parse(codexFailureTurn.endedAt ?? '')
    );
    const failed = view.steps.find((step) => step.kind === 'call' && step.status === 'failed');
    assert.ok(failed?.kind === 'call');
    const markup = renderToStaticMarkup(<TurnTraceCallBody tool={failed.tool} />);

    assert.match(
        markup,
        /Command failed<span class="text-muted tabular-nums"> · exit code 1<\/span>/
    );
    // The printed output is evidence, not the reason: it shows as Output, never as the error line.
    assert.match(markup, />Output<[\s\S]*ls: \/definitely\/not\/here: No such file or directory/);
    assert.doesNotMatch(markup, /aria-expanded/);
    assert.doesNotMatch(markup, /formatted_output|exit_code/);
});

test('a turn that failed states why above its steps instead of claiming nothing ran', () => {
    const markup = renderJournal({
        ...journal([]),
        failure: { message: 'Harness session has an unfinished turn and must be continued.' },
        status: 'failed',
    });

    assert.match(markup, /Harness session has an unfinished turn/);
    assert.doesNotMatch(markup, /No activity was recorded/);
});

test('an image step is a closed row like any step, its picture and prompt behind it', () => {
    const markup = renderJournal(imageTurn);
    const trigger =
        markup.match(
            /<button[^>]*data-trace-row[^>]*>(?:(?!<\/button>)[\s\S])*Generated an image[\s\S]*?<\/button>/
        )?.[0] ?? '';

    assert.match(trigger, /aria-expanded="false"/);
    // Closed, neither the picture, its file, nor its prompt is in the page.
    assert.doesNotMatch(markup, /<img|20261006-174019-exec-0b47|lighthouse/i);
});

test('a live trace ticks: the running step and the totals re-derive from the clock', () => {
    const live: AgentExecutionJournal = {
        ...journal([
            tool({
                endedAt: undefined,
                input: { command: 'sleep 30 && date' },
                status: 'running',
                toolCallId: 'call-live',
            }),
        ]),
        status: 'running',
    };
    const at12 = renderSteps(live, Date.parse(at(13)));
    const at13 = renderSteps(live, Date.parse(at(14)));

    assert.match(at12, /text-shimmer/);
    assert.match(at12, /Running sleep 30 &amp;&amp; date/);
    assert.match(at12, />12s</);
    assert.match(at13, />13s</);

    const settled = renderJournal(complexTurn);
    assert.doesNotMatch(settled, /text-shimmer/);
});

test('the drawer states the outcome once: the chip leads the trace, the footer holds the totals', () => {
    const outcome = settledTurn();
    const withSteps = renderToStaticMarkup(
        <TurnTracePresentation
            access="journal"
            isPending={false}
            outcome={outcome}
            presentation={{
                journal: journal([
                    tool({ toolCallId: 'call-a', toolName: 'read' }),
                    tool({ input: { command: 'bun test' }, toolCallId: 'call-b' }),
                ]),
                kind: 'available',
            }}
        />
    );
    assert.equal(withSteps.match(/>Completed</g)?.length, 1);
    assert.match(withSteps, /data-trace-stat="Calls"[\s\S]*?>2<\/dd>/);
    assert.doesNotMatch(withSteps, /Completed in|tool call|message/);

    // No steps to total: the turn's own record says how it went.
    const summary = renderToStaticMarkup(
        <TurnTracePresentation access="summary" isPending outcome={outcome} presentation={null} />
    );
    assert.match(summary, />Completed<[\s\S]*Completed in 11s/);

    // While the first relay is pending nothing stands in for the totals.
    const pending = renderToStaticMarkup(
        <TurnTracePresentation access="journal" isPending outcome={outcome} presentation={null} />
    );
    assert.doesNotMatch(pending, /Completed/);
});

function settledTurn(): NonNullable<Parameters<typeof TurnTracePresentation>[0]['outcome']> {
    return {
        durationMs: 11_000,
        endedAt: at(11),
        events: [],
        failureKind: null,
        kind: 'settled',
        messageCount: 1,
        operationCount: 1,
        operations: [{ category: 'using_tool', completed: 1, failed: 0, interrupted: 0 }],
        outputProduced: true,
        runId: 'run-outcome',
        startedAt: at(0),
        status: 'completed',
        trigger: null,
    };
}

function renderSteps(source: AgentExecutionJournal, now: number) {
    const view = buildTurnTraceView(source, [], now);
    return renderToStaticMarkup(
        <TurnTraceScopeProvider scope={{ axisMs: view.totals.durationMs ?? 0, workspace: null }}>
            <TurnTraceSteps steps={view.steps} />
        </TurnTraceScopeProvider>
    );
}

function renderJournal(source: AgentExecutionJournal) {
    return render({ presentation: { journal: source, kind: 'available' } });
}

function render(input: {
    access?: 'journal' | 'summary';
    presentation: Parameters<typeof TurnTracePresentation>[0]['presentation'];
}) {
    return renderToStaticMarkup(
        <TurnTracePresentation
            access={input.access ?? 'journal'}
            isPending={false}
            presentation={input.presentation}
        />
    );
}

function at(seconds: number) {
    return new Date(Date.UTC(2026, 2, 31, 15, 0, seconds)).toISOString();
}

function tool(overrides: Partial<AgentExecutionJournalTool>): AgentExecutionJournalTool {
    return {
        endedAt: at(2),
        startedAt: at(1),
        status: 'completed',
        toolCallId: 'call-1',
        toolName: 'bash',
        ...overrides,
    };
}

function journal(tools: AgentExecutionJournalTool[]): AgentExecutionJournal {
    return { runId: 'run_1', startedAt: at(0), status: 'completed', tools };
}
