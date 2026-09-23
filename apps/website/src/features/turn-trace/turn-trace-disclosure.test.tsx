import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { AgentExecutionJournal, AgentExecutionJournalTool } from '@haus/api';
import { DisclosureGroup } from 'react-aria-components';
import { renderToStaticMarkup } from 'react-dom/server';
import { TurnTracePresentation } from './turn-trace.tsx';
import { readReasoning, shouldFoldReasoning } from './turn-trace-reasoning.tsx';
import { turnTraceRevealTransition } from './turn-trace-reveal.tsx';

const theme = readFileSync(new URL('../../styles/default-theme.css', import.meta.url), 'utf8');

test('every tool row is a real button that states whether it is open', () => {
    const markup = render(
        journal({
            tools: [
                tool({ toolCallId: 'call-read', toolName: 'read' }),
                tool({ input: { command: 'bun test' }, toolCallId: 'call-shell' }),
            ],
        })
    );

    const triggers = markup.match(/<button[^>]*chat-tool__trigger[^>]*>/g) ?? [];
    assert.equal(triggers.length, 2);
    for (const trigger of triggers) {
        assert.match(trigger, /aria-expanded="false"/);
        assert.match(trigger, /aria-controls="[^"]+"/);
    }
});

test('a failed call opens on its own inside the Activity accordion too', () => {
    // The Activity tab renders the trace inside a DisclosureGroup; its keys
    // must not own the trace's tool rows.
    const markup = renderToStaticMarkup(
        <DisclosureGroup>
            <TurnTracePresentation
                access="journal"
                isPending={false}
                presentation={{
                    journal: journal({
                        tools: [
                            tool({ toolCallId: 'call-ok', toolName: 'read' }),
                            tool({
                                error: 'Permission denied',
                                status: 'failed',
                                toolCallId: 'call-bad',
                            }),
                        ],
                    }),
                    kind: 'available',
                }}
            />
        </DisclosureGroup>
    );

    assert.equal(markup.match(/aria-expanded="true"/g)?.length, 1);
    assert.match(markup, /Permission denied/);
});

test('the running call is the one row that shimmers', () => {
    const markup = render(
        journal({
            status: 'running',
            tools: [
                tool({ toolCallId: 'call-done', toolName: 'read' }),
                tool({
                    endedAt: undefined,
                    input: { command: 'sleep 2' },
                    status: 'running',
                    toolCallId: 'call-live',
                }),
            ],
        })
    );

    assert.equal(markup.match(/class="text-shimmer["\s]/g)?.length, 1);
    assert.match(markup, /text-shimmer[\s\S]*sleep 2/);
});

test('a titled thought leads with its title and keeps its prose', () => {
    assert.deepEqual(readReasoning('**Planning the reply**\n\nCheck the queue first.'), {
        body: 'Check the queue first.',
        title: 'Planning the reply',
    });
    assert.deepEqual(readReasoning('**Planning the reply**'), {
        body: null,
        title: 'Planning the reply',
    });
    assert.deepEqual(readReasoning('Just thinking out loud.'), {
        body: 'Just thinking out loud.',
        title: null,
    });
});

test('only a long thought folds, behind a button that names what it controls', () => {
    const short = 'Weighing du against find.';
    const long = Array.from({ length: 6 }, () => 'A considered sentence about options. '.repeat(4))
        .join('\n\n')
        .trim();
    assert.equal(shouldFoldReasoning(short), false);
    assert.equal(shouldFoldReasoning(long), true);

    const markup = render(
        journal({
            reasoning: [
                { id: 'short', startedAt: at(1), text: short },
                { id: 'long', startedAt: at(2), text: long },
            ],
        })
    );
    const toggles = markup.match(/<button[^>]*>Show more<\/button>/g) ?? [];
    assert.equal(toggles.length, 1);
    assert.match(toggles[0] ?? '', /aria-expanded="false"/);
    const controls = toggles[0]?.match(/aria-controls="([^"]+)"/)?.[1];
    assert.ok(controls);
    assert.match(markup, new RegExp(`id="${controls}"`));
});

test('trace content reveals on a no-bounce spring, and at once under reduced motion', () => {
    assert.deepEqual(turnTraceRevealTransition(true), { duration: 0 });
    const transition = turnTraceRevealTransition(false) as {
        height: { bounce: number; type: string };
        opacity: { duration: number };
    };
    assert.equal(transition.height.type, 'spring');
    assert.equal(transition.height.bounce, 0);
    assert.ok(transition.opacity.duration <= 0.2);
});

test('the theme animates closing and never pins a closed tool body', () => {
    // A turn row opens at once and closes on the stock transition.
    assert.match(
        theme,
        /\.accordion--activity-history \.accordion__panel\[data-expanded='true'\] \{\s*transition: none;/
    );
    assert.doesNotMatch(theme, /\.accordion--activity-history \.accordion__indicator/);
    // ChatTool's closed body follows React Aria's animated height.
    assert.match(
        theme,
        /\.chat-tool__content:not\(\[data-expanded='true'\]\) \{\s*height: var\(--disclosure-panel-height, 0px\) !important;/
    );
    // Row titles take the body step, never `xs`.
    assert.match(
        theme,
        /\.chat-tool__trigger,\s*\.chat-tool__trigger-label,[^{]*\{\s*font-size: var\(--text-sm\);/
    );
});

function render(presentation: AgentExecutionJournal) {
    return renderToStaticMarkup(
        <TurnTracePresentation
            access="journal"
            isPending={false}
            presentation={{ journal: presentation, kind: 'available' }}
        />
    );
}

function at(seconds: number) {
    return new Date(Date.UTC(2026, 2, 31, 15, 0, seconds)).toISOString();
}

function tool(overrides: Partial<AgentExecutionJournalTool>): AgentExecutionJournalTool {
    return {
        endedAt: at(4),
        startedAt: at(3),
        status: 'completed',
        toolCallId: 'call-1',
        toolName: 'bash',
        ...overrides,
    };
}

function journal(overrides: Partial<AgentExecutionJournal>): AgentExecutionJournal {
    return { runId: 'run_1', startedAt: at(0), status: 'completed', tools: [], ...overrides };
}
