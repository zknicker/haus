import { expect, test } from 'bun:test';
import { type VoiceTarget, voiceInstructions } from './voice-context.ts';

test('voice identity uses the called Agent while retaining delegation and grounding', () => {
    const target = {
        agentId: 'agent',
        name: 'Beacon',
        description: 'Speak plainly.',
        brief: 'Help with the offline launch.',
        generation: 1,
        model: 'claude-sonnet-5-5',
        health: 'healthy',
        stopped: false,
        runId: null,
    } satisfies VoiceTarget;
    const instructions = voiceInstructions(target);
    expect(instructions).toStartWith('You are Beacon, the Haus Agent');
    expect(instructions).not.toContain('voice interface for');
    expect(instructions).not.toContain('Existing Agent:');
    for (const heading of ['Backchannel policy:', 'Interruption policy:', 'Delegation policy:']) {
        expect(instructions).toContain(heading);
    }
    expect(instructions).toContain('until current context or a backend result confirms it');
    expect(instructions).toContain('explain honestly');
    expect(instructions).toContain('Do not volunteer an activity report');
    expect(instructions).toContain('Greet once per call');
    expect(instructions).toContain('Do not immediately follow it with "still checking"');
    expect(instructions).toContain('about ten seconds');
    expect(instructions).toContain('Agent description: Speak plainly.');
    expect(instructions).toContain('Agent standing brief: Help with the offline launch.');
});
