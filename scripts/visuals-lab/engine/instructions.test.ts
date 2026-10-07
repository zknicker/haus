import { expect, test } from 'bun:test';
import { renderAgentInstructions } from '../../../apps/computer/src/harness/managed-instructions.ts';
import { labInstructionsFor, visualsPointer } from './instructions.mjs';

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

test('only a preview run is told haus visual preview works', () => {
    const plain = labInstructionsFor();
    const preview = labInstructionsFor({ preview: true });
    expect(plain).toContain(visualsPointer);
    expect(preview).toContain(visualsPointer);
    expect(plain).toContain('no haus CLI; do not try to run it');
    expect(plain).not.toContain('haus visual preview');
    expect(preview).toContain('the only haus command that works is `haus visual preview`');
});
