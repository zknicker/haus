import { expect, test } from 'bun:test';
import { agentCreateAgentInputSchema, agentCreateAgentRequestSchema } from './agent-creation.ts';

const input = {
    target: '#product',
    displayName: 'Lantern',
    description: 'Watches delivery evidence.',
    nonce: 'legacy-or-fresh',
};

test('fresh Agent-owned creation requires a nonempty standing brief', () => {
    expect(agentCreateAgentInputSchema.safeParse(input).success).toBe(false);
    expect(agentCreateAgentInputSchema.safeParse({ ...input, brief: null }).success).toBe(false);
    expect(agentCreateAgentInputSchema.safeParse({ ...input, brief: '  ' }).success).toBe(false);
    expect(
        agentCreateAgentInputSchema.parse({ ...input, brief: ' Own delivery evidence. ' }).brief
    ).toBe('Own delivery evidence.');
});

test('the Server legacy decoder keeps omitted briefs for old nonce replay and actionable refusal', () => {
    expect(agentCreateAgentRequestSchema.parse(input).brief).toBeNull();
    expect(agentCreateAgentRequestSchema.parse({ ...input, brief: null }).brief).toBeNull();
});
