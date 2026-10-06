import assert from 'node:assert/strict';
import test from 'node:test';
import { complexTurn } from './turn-trace-claude-fixtures.ts';
import { codexFailureTurn, imageTurn } from './turn-trace-codex-fixtures.ts';
import { call, journal, t } from './turn-trace-test-fixtures.ts';
import { buildTurnTraceView, type TurnTraceStep } from './turn-trace-view.ts';

const settled = (value: typeof complexTurn) =>
    buildTurnTraceView(value, [], Date.parse(value.endedAt ?? value.startedAt));

function find<K extends TurnTraceStep['kind']>(
    steps: readonly TurnTraceStep[],
    kind: K,
    index = 0
): Extract<TurnTraceStep, { kind: K }> {
    const matches = steps.filter((step) => step.kind === kind);
    const step = matches[index];
    assert.ok(step, `no ${kind} step #${index}`);
    return step as Extract<TurnTraceStep, { kind: K }>;
}

test('P0-1: totals count nested sub-agent work and span the whole trace', () => {
    const { totals } = settled(complexTurn);
    assert.equal(totals.calls, 12);
    assert.equal(totals.subagents, 3);
    assert.equal(totals.failed, 3);
    assert.equal(totals.durationMs, 84_646);
    assert.equal(totals.callsByKind.search, 3);
    assert.equal(totals.isRunning, false);
});

test('the complex turn reads as Haus, three parallel sub-agents, then the work', () => {
    const { steps } = settled(complexTurn);
    assert.deepEqual(
        steps.map((step) => ('label' in step ? `${step.kind}: ${step.label}` : step.kind)),
        [
            'haus: Claimed a task · Sent a message',
            'subagent: Ran sub-agent: Security review',
            'subagent: Ran sub-agent: Test coverage audit',
            'subagent: Ran sub-agent: API docs check',
            'reasoning',
            'fold: Read 2 files',
            'call: Edited validate.ts',
            'call: Ran npm test',
        ]
    );
    const lanes = steps.filter((step) => step.kind === 'subagent').map((step) => step.parallel);
    assert.deepEqual(lanes, [
        { group: 0, lane: 0, lanes: 3 },
        { group: 0, lane: 1, lanes: 3 },
        { group: 0, lane: 2, lanes: 3 },
    ]);
    assert.equal(find(steps, 'fold').isParallel, true);
    assert.equal(find(steps, 'call', 1).tool.extraCommands, 1);
});

test('P0-5: a sub-agent with failed children warns and counts them', () => {
    const { steps } = settled(complexTurn);
    const security = find(steps, 'subagent');
    assert.equal(security.status, 'warning');
    assert.equal(security.tool.failedChildCount, 2);
    assert.equal(security.tool.report?.includes('**Findings**'), true);
    const failed = security.children.filter(
        (step) => step.kind === 'call' && step.status === 'failed'
    );
    assert.equal(failed.length, 2);
    const [glob] = failed;
    assert.equal(
        glob?.kind === 'call' &&
            glob.tool.failure?.message.startsWith('No such tool available: Glob'),
        true
    );
    assert.equal(find(steps, 'subagent', 2).status, 'completed');
});

test('P0-5: sub-agent children fold and show workspace-relative paths', () => {
    const docs = find(settled(complexTurn).steps, 'subagent', 2);
    const fold = find(docs.children, 'fold');
    assert.equal(fold.label, 'Read 2 files');
    assert.deepEqual(
        fold.members.map((member) => [member.label, member.tool.target?.dir]),
        [
            ['Read README.md', 'projects/tinylink'],
            ['Read index.ts', 'projects/tinylink/src'],
        ]
    );
    const find0 = find(find(settled(complexTurn).steps, 'subagent').children, 'call', 2);
    assert.equal(find0.label, 'Ran find src -type f');
});

test('P0-4: a failed Codex command stays its own row with a readable error', () => {
    const { steps, totals } = settled(codexFailureTurn);
    const failed = steps.find((step) => step.kind === 'call' && step.status === 'failed');
    assert.ok(failed?.kind === 'call');
    assert.deepEqual(failed.tool.failure, {
        exitCode: 1,
        message: 'ls: /definitely/not/here: No such file or directory',
    });
    assert.equal(totals.failed, 1);
});

test('P2-3: unknown tools name their arguments and a browser call its host', () => {
    const labels = settled(codexFailureTurn)
        .steps.filter((step) => step.kind === 'call')
        .map((step) => step.label);
    assert.ok(labels.includes('Used execute · code'));
    assert.ok(labels.includes('Fetched www.google.com'));
});

test('P1-3: five parallel sleeps fold into one parallel row on five lanes', () => {
    const fold = find(settled(codexFailureTurn).steps, 'fold');
    assert.equal(fold.label, 'Ran sleep 45 && echo done ×5');
    assert.equal(fold.isParallel, true);
    assert.deepEqual(
        fold.members.map((member) => member.parallel?.lane),
        [0, 1, 2, 3, 4]
    );
    assert.equal(fold.caption, 'Running five parallel exec commands');
    assert.equal(fold.timing.durationMs, 44_865);
});

test('P1-4: reasoning titles caption the next step without breaking a fold', () => {
    const curls = find(settled(codexFailureTurn).steps, 'fold', 1);
    assert.equal(curls.label, 'Ran 2 commands');
    assert.deepEqual(curls.thoughts, [
        'Planning web search using curl',
        'Testing Bing search access',
    ]);
    assert.equal(curls.caption, 'Testing Bing search access');
});

test('P1-1: bookkeeping folds into one Haus step where it began', () => {
    const { steps } = settled(codexFailureTurn);
    const haus = find(steps, 'haus');
    assert.equal(steps[0], haus);
    assert.equal(
        haus.label,
        'Claimed a task · Read MEMORY.md · Sent a message · Updated a task · Modified MEMORY.md'
    );
    assert.equal(haus.members.length, 5);
    assert.equal(haus.parallel, null);
});

test('P1-6: an image step carries the workspace file and its prompt', () => {
    const { steps, totals } = settled(imageTurn);
    const image = steps.find((step) => step.kind === 'call' && step.tool.kind === 'image');
    assert.ok(image?.kind === 'call');
    assert.deepEqual(image.tool.image, {
        file: {
            dir: 'generated-images',
            name: '20261006-174019-exec-0b470f15.png',
            path: 'generated-images/20261006-174019-exec-0b470f15.png',
        },
        media: 'image',
        prompt: 'A small friendly pixel-art lighthouse on a foggy shoreline at dusk',
        workspacePath: 'generated-images/20261006-174019-exec-0b470f15.png',
    });
    assert.equal(image.caption, 'Calling image generation tool');
    assert.equal(totals.images, 1);
    assert.equal(find(steps, 'call').tool.target?.dir, '~/.codex/skills/.system/imagegen');
});

test('a closing run of reasoning titles is its own thought step, latest first', () => {
    const thought = settled(imageTurn).steps.at(-1);
    assert.ok(thought?.kind === 'thought');
    assert.equal(thought.caption, 'Confirming minimal final response');
    assert.deepEqual(thought.thoughts, [
        'Resolving final output format',
        'Confirming minimal final response',
    ]);
});

test('a turn that only did bookkeeping shows it plainly', () => {
    const trivial = journal(
        'run_Vz8',
        ['39:00.000', '39:17.266'],
        [
            call('send', 'bash', ['39:14.400', '39:15.026'], {
                command: "haus message send --target dm:@zach <<'HAUSMSG'\n391\nHAUSMSG",
            }),
        ]
    );
    const { steps } = settled(trivial);
    assert.equal(steps.length, 1);
    assert.equal(find(steps, 'call').label, 'Sent a message with haus');
});

test('P0-4: a turn that failed before any call states why', () => {
    const failed = journal('run_YeI4', ['49:51.111', '49:51.297'], [], {
        error: 'Error: Harness session agt_1 has an unfinished turn and must be continued.\n    at requirePromptableTurn (index.js:3244:15)',
        status: 'failed',
    });
    const view = settled(failed);
    assert.deepEqual(view.steps, []);
    assert.deepEqual(view.error, {
        exitCode: null,
        message: 'Harness session agt_1 has an unfinished turn and must be continued.',
    });
    assert.equal(view.status, 'failed');
});

test('an interrupted call is never folded or filed as bookkeeping', () => {
    const interrupted = journal(
        'run_izwu',
        ['47:16.530', '48:12.296'],
        [
            call('date', 'bash', ['47:28.907', '47:58.785'], { command: 'sleep 30 && date' }),
            call(
                'uptime',
                'bash',
                ['48:02.706', '48:12.294'],
                { command: 'sleep 30 && uptime' },
                {
                    interruptions: [{ at: t('48:12.294'), reason: 'stream_abort' }],
                    status: 'interrupted',
                }
            ),
        ],
        { status: 'interrupted' }
    );
    const { steps } = settled(interrupted);
    assert.deepEqual(
        steps.map((step) => step.kind === 'call' && step.status),
        ['completed', 'interrupted']
    );
});

test('P1-7: a live turn reads in the present tense and ticks with the clock', () => {
    const live = journal(
        'run_live',
        ['47:16.530'],
        [
            call('date', 'bash', ['47:28.907', '47:58.785'], { command: 'sleep 30 && date' }),
            call(
                'uptime',
                'bash',
                ['48:02.706'],
                { command: 'sleep 30 && uptime' },
                { status: 'running' }
            ),
        ],
        {
            reasoning: [{ id: 'r', startedAt: t('48:03.000'), text: '**Waiting on uptime**' }],
            status: 'running',
        }
    );
    const now = Date.parse(t('48:14.706'));
    const view = buildTurnTraceView(live, [], now);
    const fold = find(view.steps, 'fold');
    assert.equal(fold.label, 'Running 2 commands');
    assert.equal(fold.members[1]?.label, 'Running sleep 30 && uptime');
    assert.equal(fold.members[1]?.timing.durationMs, 12_000);
    const thought = view.steps.at(-1);
    assert.ok(thought?.kind === 'thought' && thought.isStreaming);
    assert.equal(view.totals.isRunning, true);
    assert.equal(view.totals.durationMs, now - Date.parse(t('47:16.530')));
    const later = buildTurnTraceView(live, [], now + 1000);
    assert.equal(find(later.steps, 'fold').members[1]?.timing.durationMs, 13_000);
});
