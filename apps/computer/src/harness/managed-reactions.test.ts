import { expect, test } from 'bun:test';
import { renderAgentInstructions } from './managed-instructions.ts';

test('acknowledgment-only celebrations use a reaction rather than an emoji-only reply', () => {
    const prompt = renderAgentInstructions({
        agentId: 'agt_test',
        agentName: 'Test',
        homeTimezone: 'UTC',
        hostname: 'test',
        initialRole: null,
        os: 'test',
        runtimeVersion: 'test',
        webAccess: null,
        workspacePath: '/workspace',
    });
    expect(prompt).toContain(
        'For acknowledgment-only thanks or celebration, use `haus message react`; an emoji-only message is still a reply.'
    );
    expect(prompt).toContain('an explicit FYI gets nothing');
    expect(prompt).toContain('When a message needs a reply, send it with `haus message send`.');
});
