import { expect, test } from 'bun:test';
import type { AgentTurnOperationCount } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AgentActivityTurn } from './agent-activity-turns.ts';
import { TurnRowContent } from './agent-turn-row.tsx';
import type { TurnRowTitle } from './agent-turn-row-model.ts';

test('a titled row is one line: time, request, place, length — no action marks', () => {
    const markup = render(settled({ durationMs: 660_000 }), {
        kind: 'text',
        place: 'DM',
        request: 'Ship the changelog\nThen tag it',
        text: 'Ship the changelog Then tag it',
    });
    expect(text(markup)).toEqual([time(), 'Ship the changelog Then tag it', 'DM', '11m']);
    expect(markup).toMatch(/class="[^"]*truncate text-foreground/);
    expect(markup).not.toMatch(/font-medium|Failed|<svg/);
    // Time and length are tabular and never wrap.
    expect(markup).toMatch(/<time class="whitespace-nowrap text-muted tabular-nums"/);
    expect(markup).toMatch(/whitespace-nowrap text-end text-muted tabular-nums/);
});

test('an open row replaces its truncated title with the whole request, once', () => {
    const markup = render(
        settled(),
        { kind: 'text', place: 'DM', request: 'Ship it\nThen tag it', text: 'Ship it Then tag it' },
        1,
        true
    );
    expect(text(markup)).toEqual([time(), 'Ship it\nThen tag it', '1m']);
    expect(markup).toContain('whitespace-pre-line');
    expect(markup).not.toContain('truncate');
});

test('a row without a visible request is titled, muted, by what the turn did', () => {
    const markup = render(
        settled({ messageCount: 0, operations: [op('editing_files', 3), op('reading_files', 4)] }),
        { kind: 'none' }
    );
    expect(text(markup)).toEqual([time(), 'Edited 3 files · read 4', '1m']);
    expect(markup).toMatch(/class="min-w-0 truncate text-muted">Edited/);
});

test('a failed row shows only its glyph, with the folded repeat count', () => {
    const markup = render(settled({ status: 'failed' }), { kind: 'none' }, 3);
    expect(text(markup)).toEqual([time(), 'Failed', 'Sent 1 message', '3×', '1m']);
    expect(markup).toMatch(/text-danger" title="Failed"/);
    expect(render(settled(), { kind: 'none' })).not.toContain('title=');
});

test('an interrupted row takes the warning glyph', () => {
    const markup = render(settled({ status: 'interrupted' }), { kind: 'none' });
    expect(markup).toMatch(/text-warning" title="Interrupted"/);
});

test('a running row shows a spinner glyph and a live length', () => {
    const markup = render(
        { ...base(), kind: 'active', startedAt: new Date(Date.now() - 42_000).toISOString() },
        { kind: 'pending', place: '#product' }
    );
    expect(markup).toContain('Working');
    expect(markup).toMatch(/>4[23]s</);
});

function op(category: AgentTurnOperationCount['category'], completed: number) {
    return { category, completed, failed: 0, interrupted: 0 };
}

function render(turn: AgentActivityTurn, title: TurnRowTitle, count = 1, isExpanded = false) {
    return renderToStaticMarkup(
        <TurnRowContent
            isExpanded={isExpanded}
            row={{ count, latest: turn, since: turn.startedAt }}
            title={title}
        />
    );
}

/** Leaf text in document order, ignoring icons and empty slots. */
function text(markup: string): string[] {
    return [...markup.matchAll(/>([^<>]+)</g)].map((match) => match[1] ?? '');
}

const startedAt = '2026-10-06T12:00:00.000Z';

function time() {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: true, minute: '2-digit' })
        .format(new Date(startedAt))
        .toLowerCase();
}

function base() {
    return {
        durationMs: 60_000,
        events: [],
        messageCount: 1,
        operationCount: 0,
        operations: [],
        runId: 'run_one',
        startedAt,
        trigger: null,
    };
}

function settled(overrides: Partial<Extract<AgentActivityTurn, { kind: 'settled' }>> = {}) {
    return {
        ...base(),
        endedAt: startedAt,
        failureKind: null,
        kind: 'settled',
        outputProduced: true,
        status: 'completed',
        ...overrides,
    } satisfies AgentActivityTurn;
}
