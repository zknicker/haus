import { expect, test } from 'bun:test';
import { renderAgentInstructions } from '../../../apps/computer/src/harness/managed-instructions.ts';
import { visualsPointer } from './instructions.mjs';

test('the eval carries the product prompt visuals pointer verbatim', () => {
    const productPrompt = renderAgentInstructions({
        agentId: 'agt_visuals_eval',
        agentName: 'Juniper',
        homeTimezone: 'America/Los_Angeles',
        hostname: 'computer.test',
        initialRole: null,
        midTurnNotices: true,
        os: 'macOS',
        runtimeVersion: 'test',
        webAccess: null,
        workspacePath: '/workbench',
    });

    expect(productPrompt).toContain(visualsPointer);
});
