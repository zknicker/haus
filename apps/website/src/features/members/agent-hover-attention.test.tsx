import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { testAgent } from './agent-fixtures.ts';
import { AgentAttentionLine, agentHoverAttention } from './agent-hover-attention.tsx';

const grokAgent = testAgent({ desiredModelId: 'grok-4' });
const wakePause = {
    failureCount: 3,
    lastFailure: { at: '2026-11-19T11:00:00.000Z', code: null, kind: 'unknown' as const },
    nextProbeAt: null,
    pausedAt: '2026-11-19T11:00:00.000Z',
};

test('the hover card warns about a missing connection only once the list has loaded', () => {
    expect(agentHoverAttention(grokAgent, null, undefined)).toEqual({ banner: null, line: null });
    const attention = agentHoverAttention(grokAgent, null, {
        agentLoop: 'runner',
        connections: [],
    });
    expect(attention).toEqual({
        banner: null,
        line: { issue: { kind: 'missing', providerName: 'xAI' }, kind: 'connection-issue' },
    });
    expect(
        renderToStaticMarkup(<AgentAttentionLine agent={grokAgent} line={attention.line} />)
    ).toBe(
        '<p class="text-warning text-xs">No xAI connection. Connect one in Settings → Models.</p>'
    );
});

test('the hover card of an Agent on its Computer shows its wake pause and no connection warning', () => {
    expect(
        agentHoverAttention({ ...grokAgent, wakePause }, null, {
            agentLoop: 'computer',
            connections: [],
        })
    ).toEqual({ banner: wakePause, line: null });
});

test('on the runner a paused Agent with no connection keeps both the banner and the fix', () => {
    expect(
        agentHoverAttention({ ...grokAgent, wakePause }, null, {
            agentLoop: 'runner',
            connections: [],
        })
    ).toEqual({
        banner: wakePause,
        line: { issue: { kind: 'missing', providerName: 'xAI' }, kind: 'connection-issue' },
    });
});
