import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentExecutionJournal, AgentExecutionJournalTool } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import { TurnTracePresentation } from './turn-trace.tsx';
import { readReasoning } from './turn-trace-reasoning.tsx';
import { turnTraceRevealTransition } from './turn-trace-reveal.tsx';

test('every row with evidence is a real button that states whether it is open', () => {
    const markup = render(
        journal({
            tools: [
                tool({ output: 'line one', toolCallId: 'call-read', toolName: 'read' }),
                tool({ input: { command: 'bun test' }, toolCallId: 'call-shell' }),
            ],
        })
    );

    const triggers = markup.match(/<button[^>]*data-trace-row[^>]*>/g) ?? [];
    assert.equal(triggers.length, 2);
    for (const trigger of triggers) {
        assert.match(trigger, /aria-expanded="false"/);
        assert.match(trigger, /aria-controls="[^"]+"/);
    }
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

test('a thought is one closed row like any step, its first line as detail', () => {
    const long = Array.from({ length: 6 }, () => 'A considered sentence about options. '.repeat(4))
        .join('\n\n')
        .trim();
    const markup = render(
        journal({
            reasoning: [
                { id: 'titled', startedAt: at(1), text: '**Weighing tools**\n\nDu or find.' },
                { id: 'long', startedAt: at(2), text: long },
                { id: 'bare', startedAt: at(3), text: '**Only a title**' },
            ],
        })
    );
    // No fold, no fade, no Show more: each thought with prose is a closed disclosure.
    assert.doesNotMatch(markup, /Show more|scroll-fade-b/);
    const triggers = markup.match(/<button[^>]*aria-expanded="false"[^>]*>/g) ?? [];
    assert.equal(triggers.length, 2);
    assert.match(markup, />Weighing tools<\/span><span[^>]*>Du or find\.</);
    assert.match(markup, />Thought<\/span><span[^>]*>A considered sentence/);
    // A title with no prose has nothing to open.
    assert.match(markup, />Only a title</);
    assert.doesNotMatch(markup, /chat-markdown/);
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
