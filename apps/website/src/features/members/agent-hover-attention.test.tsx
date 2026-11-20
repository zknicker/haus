import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { testAgent } from './agent-fixtures.ts';
import { AgentAttentionLine, agentHoverAttention } from './agent-hover-attention.tsx';

const grokAgent = testAgent({ desiredModelId: 'grok-4' });

test('the hover card warns about a missing connection only once the list has loaded', () => {
    expect(agentHoverAttention(grokAgent, null, undefined)).toBeNull();
    const attention = agentHoverAttention(grokAgent, null, []);
    expect(attention).toEqual({
        issue: { kind: 'missing', providerName: 'xAI' },
        kind: 'connection-issue',
    });
    expect(
        renderToStaticMarkup(<AgentAttentionLine agent={grokAgent} attention={attention} />)
    ).toBe(
        '<p class="text-warning text-xs">No xAI connection. Connect one in Settings → Models.</p>'
    );
});
