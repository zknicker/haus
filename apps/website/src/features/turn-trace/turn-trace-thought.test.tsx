import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentExecutionJournal } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import { TurnTracePresentation } from './turn-trace.tsx';
import { codexFailureTurn, imageTurn } from './turn-trace-codex-fixtures.ts';

test('a reasoning title is a Thought row on the grid, its title as muted detail', () => {
    const markup = renderJournal(codexFailureTurn);

    assert.doesNotMatch(markup, /data-trace-caption/);
    const row = markup.match(
        /<div[^>]*data-trace-row[^>]*>(?:(?!data-trace-row)[\s\S])*?Running five parallel exec commands[\s\S]*?data-trace-cell="slot"><\/span>/
    )?.[0];
    assert.ok(row, 'the title sits in a trace row');
    assert.match(row, /text-muted">Thought</);
    assert.match(row, /class="min-w-0 shrink-\[4\] truncate text-muted">Running five parallel/);
    // On the lane like any step: a mark at its time, nothing to open.
    assert.match(row, /data-trace-bar="thinking"/);
    assert.match(row, /data-trace-cell="slot"><\/span>/);
});

test('a run of titles is one Thought row that opens to all of them', () => {
    const markup = renderJournal(imageTurn);

    assert.match(
        markup,
        /<button[^>]*aria-expanded="false"[^>]*>[\s\S]*?>Thought<[\s\S]*?Confirming minimal final response[\s\S]*?2 thoughts/
    );
});

function renderJournal(source: AgentExecutionJournal) {
    return renderToStaticMarkup(
        <TurnTracePresentation
            access="journal"
            isPending={false}
            presentation={{ journal: source, kind: 'available' }}
        />
    );
}
