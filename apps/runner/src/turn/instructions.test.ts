import { expect, test } from 'bun:test';
import { planRulesDelivery } from '@haus/agent-prompt';
import { skillEntry } from './agent-drive.ts';
import {
    composeTurnPrompt,
    planInstructionsUpdate,
    planMemoryDelivery,
    sessionAfterTurn,
} from './instructions.ts';
import { freshSession } from './session-file.ts';

const composed = { fingerprint: 'current', instructions: 'You are "Blippy".\n' };
const resumed = {
    ...freshSession({ generation: 2, harness: 'claude-agent-sdk', modelId: 'claude-sonnet-5' }),
    deliveredInstructionFingerprint: 'older',
    deliveredMemoryDigest: null,
    launchedInstructionFingerprint: 'older',
    nativeSessionId: 'native-1',
};

test('a resumed session on older instructions gets one update block ahead of the memory', () => {
    const plan = planInstructionsUpdate({ composed, isResume: true, session: resumed });
    const memory = planMemoryDelivery({
        content: '# Memory\n- ship R3\n',
        isResume: true,
        receipt: null,
    });
    expect(
        composeTurnPrompt({
            instructions: plan,
            memoryBlock: memory.block,
            rulesBlock: null,
            skillNotice: null,
            turnContent: 'Start.',
        })
    ).toBe(
        [
            '<haus-instructions-update>',
            'Haus updated your standing instructions since this session started. The instructions below replace the earlier standing instructions (system or developer prompt) for the rest of this session; where they differ, follow these.',
            '',
            'You are "Blippy".',
            '</haus-instructions-update>',
            '',
            '<haus-memory>',
            'Your MEMORY.md, as it is now. Haus puts it here whenever it changed since this session last saw it.',
            '',
            '# Memory',
            '- ship R3',
            '</haus-memory>',
            '',
            'Start.',
        ].join('\n')
    );
});

test('a completed update turn advances the receipts, an interrupted one keeps them', () => {
    const plan = planInstructionsUpdate({ composed, isResume: true, session: resumed });
    const memory = planMemoryDelivery({ content: 'notes', isResume: true, receipt: null });
    const after = (outcome: 'completed' | 'interrupted', compacted: boolean) =>
        sessionAfterTurn({
            composedFingerprint: 'current',
            memory,
            nativeSessionId: 'native-1',
            outcome,
            plan,
            rules: planRulesDelivery({ files: [], isResume: true, receipts: {} }),
            session: resumed,
            turn: { bootstrapFingerprint: 'boot', compacted },
        });
    expect(after('completed', false)).toMatchObject({
        deliveredInstructionFingerprint: 'current',
        deliveredMemoryDigest: memory.digest,
        interruptedTurn: false,
        launchedInstructionFingerprint: 'older',
    });
    expect(after('interrupted', false)).toMatchObject({
        deliveredInstructionFingerprint: 'older',
        deliveredMemoryDigest: null,
        interruptedTurn: true,
    });
    expect(after('completed', true)).toMatchObject({
        deliveredInstructionFingerprint: 'older',
        deliveredMemoryDigest: null,
    });
});

test('an unchanged MEMORY.md and current instructions add nothing to a resumed turn', () => {
    const first = planMemoryDelivery({ content: 'notes', isResume: false, receipt: null });
    const again = planMemoryDelivery({ content: 'notes', isResume: true, receipt: first.digest });
    expect(again.block).toBeNull();
    expect(
        planInstructionsUpdate({
            composed,
            isResume: true,
            session: { deliveredInstructionFingerprint: 'current' },
        })
    ).toEqual({ kind: 'current' });
});

test('a skill listing entry reads the SKILL.md frontmatter, falling back to its folder', () => {
    expect(
        skillEntry(
            'visuals',
            '---\nname: visuals\ndescription: "Make charts and diagrams."\n---\n# Visuals'
        )
    ).toEqual({ description: 'Make charts and diagrams.', name: 'visuals' });
    expect(skillEntry('notes', '# No frontmatter')).toEqual({ description: '', name: 'notes' });
});
