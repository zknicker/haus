import { expect, test } from 'bun:test';
import { agentRuntimeCreateAgentSchema } from './contracts.ts';

test('ordinary Runtime Agent creation rejects retired archetype input', () => {
    expect(
        agentRuntimeCreateAgentSchema.safeParse({
            archetype: 'guide',
            id: 'agt_scout',
            name: 'Scout',
        }).success
    ).toBe(false);
});
