import { expect, test } from 'bun:test';
import { type AgentPromptRenderInput, renderAgentInstructions } from './managed-instructions.ts';

test('renders an owner-set personality as its own closing section, and nothing when empty', () => {
    const prompt = render({
        initialRole: 'Keeps release notes current.',
        personality: '  Terse. Plain words. Dry humor.  ',
    });

    expect(prompt.endsWith('## Personality\n\nTerse. Plain words. Dry humor.\n')).toBe(true);
    expect(prompt.indexOf('## Initial role')).toBeLessThan(prompt.indexOf('## Personality'));
    for (const personality of [null, '', '   ', undefined]) {
        expect(render({ personality })).not.toContain('## Personality');
    }
});

function render(overrides: Partial<AgentPromptRenderInput>) {
    return renderAgentInstructions({
        agentId: 'agt_prompt_test',
        agentName: 'Orbit',
        homeTimezone: 'UTC',
        hostname: 'computer.test',
        initialRole: null,
        os: 'macOS',
        runtimeVersion: 'test',
        webAccess: null,
        workspacePath: '/workbench',
        ...overrides,
    });
}
