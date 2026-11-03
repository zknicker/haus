import { afterEach, expect, test } from 'bun:test';
import { composeAgentInstructions, volatileHostFacts } from './instructions.ts';
import {
    deliveredInstructionReceipt,
    formatInstructionsUpdate,
    type InstructionsUpdatePlan,
    planInstructionsUpdate,
    withInstructionsUpdate,
} from './instructions-update.ts';

const productVersion = process.env.HAUS_COMPUTER_PRODUCT_VERSION;
afterEach(() => {
    if (productVersion === undefined) {
        Reflect.deleteProperty(process.env, 'HAUS_COMPUTER_PRODUCT_VERSION');
    } else {
        process.env.HAUS_COMPUTER_PRODUCT_VERSION = productVersion;
    }
});

const facts = {
    agentId: 'agt_plan',
    agentName: 'Plan',
    homeTimezone: 'UTC',
    initialRole: 'Own the original lane.',
    runtimeId: 'codex',
    workspacePath: '/workspace',
};

const opening =
    '<haus-instructions-update>\nHaus updated your standing instructions since this session started. The instructions below replace the earlier standing instructions (system or developer prompt) for the rest of this session; where they differ, follow these.\n\n';

function plan(options: {
    delivered: string | null;
    isResume: boolean;
    role?: string;
    wake?: boolean;
}) {
    return planInstructionsUpdate({
        composed: composeAgentInstructions({ ...facts, initialRole: options.role ?? null }),
        isResume: options.isResume,
        session: { deliveredInstructionFingerprint: options.delivered },
        wake: options.wake ?? false,
    });
}

test('the volatile host facts are pinned: adding one is a deliberate change', () => {
    expect(volatileHostFacts).toEqual({ hostname: '', os: '', runtimeVersion: '' });
});

test('a release alone keeps the stable fingerprint; an Agent fact the prompt shows changes it', () => {
    process.env.HAUS_COMPUTER_PRODUCT_VERSION = '1.0.0';
    const base = composeAgentInstructions(facts);
    process.env.HAUS_COMPUTER_PRODUCT_VERSION = '1.0.1';
    const released = composeAgentInstructions(facts);
    const reassigned = composeAgentInstructions({ ...facts, initialRole: 'Own the new lane.' });

    expect(released.fingerprint).not.toBe(base.fingerprint);
    expect(released.stableFingerprint).toBe(base.stableFingerprint);
    // A session still starts on, and an update still carries, the real host facts.
    expect(released.instructions).toContain('- Runtime: 1.0.1');
    expect(reassigned.stableFingerprint).not.toBe(released.stableFingerprint);
    expect(composeAgentInstructions({ ...facts, agentName: 'Renamed' }).stableFingerprint).not.toBe(
        base.stableFingerprint
    );
});

test('plan: a fresh session needs nothing; a resume is checked against its delivery record', () => {
    const current = composeAgentInstructions({ ...facts, initialRole: null }).stableFingerprint;

    expect(plan({ delivered: null, isResume: false })).toEqual({ kind: 'fresh' });
    expect(plan({ delivered: 'older', isResume: false })).toEqual({ kind: 'fresh' });
    expect(plan({ delivered: current, isResume: true })).toEqual({ kind: 'current' });
    expect(plan({ delivered: current, isResume: true, role: 'Own a lane.' }).kind).toBe('inject');
    expect(plan({ delivered: 'older', isResume: true }).kind).toBe('inject');
    // No record: inject once rather than Raft's silent baseline (operator decision).
    expect(plan({ delivered: null, isResume: true }).kind).toBe('inject');
});

test('plan: a wake turn defers a due update and leaves a current session current', () => {
    const current = composeAgentInstructions({ ...facts, initialRole: null }).stableFingerprint;

    expect(plan({ delivered: 'older', isResume: true, wake: true })).toEqual({ kind: 'deferred' });
    expect(plan({ delivered: null, isResume: true, wake: true })).toEqual({ kind: 'deferred' });
    expect(plan({ delivered: current, isResume: true, wake: true })).toEqual({ kind: 'current' });
    expect(plan({ delivered: null, isResume: false, wake: true })).toEqual({ kind: 'fresh' });
});

test('an update leads the turn with the full current instructions, marked as replacing the old', () => {
    const injected = plan({ delivered: 'older', isResume: true, role: 'Own the new lane.' });
    const prompt = withInstructionsUpdate(injected, 'Hello there');

    expect(prompt.startsWith(opening)).toBe(true);
    expect(prompt).toContain('## Initial role\n\nOwn the new lane. This may evolve.');
    expect(prompt.endsWith('This may evolve.\n</haus-instructions-update>\n\nHello there')).toBe(
        true
    );
    expect(formatInstructionsUpdate('PROMPT V2\n')).toBe(
        `${opening}PROMPT V2\n</haus-instructions-update>`
    );
    expect(withInstructionsUpdate({ kind: 'current' }, 'Hello there')).toBe('Hello there');
    expect(withInstructionsUpdate({ kind: 'deferred' }, 'Hello there')).toBe('Hello there');
});

const stored = {
    deliveredInstructionFingerprint: 'old_stable',
    instructionFingerprint: 'old',
    launchedInstructionFingerprint: 'launch_stable',
};
const composed = { fingerprint: 'new', stableFingerprint: 'new_stable' };
const inject: InstructionsUpdatePlan = { block: 'b', kind: 'inject' };

function receipt(plan: InstructionsUpdatePlan, turn: { compacted?: boolean; completed?: boolean }) {
    return deliveredInstructionReceipt(plan, stored, composed, {
        compacted: turn.compacted ?? false,
        completed: turn.completed ?? true,
    });
}

test('only a delivery advances the receipt', () => {
    const advanced = {
        deliveredInstructionFingerprint: 'new_stable',
        instructionFingerprint: 'new',
    };

    expect(receipt({ kind: 'fresh' }, {})).toEqual({
        ...advanced,
        launchedInstructionFingerprint: 'new_stable',
    });
    expect(receipt(inject, {})).toEqual({ ...stored, ...advanced });
    expect(receipt({ kind: 'deferred' }, {})).toEqual(stored);
    expect(receipt({ kind: 'current' }, {})).toEqual(stored);
    // A launch delivers even when its turn is interrupted; an interrupted update may not have.
    expect(receipt({ kind: 'fresh' }, { completed: false })).toMatchObject(advanced);
    expect(receipt(inject, { completed: false })).toEqual(stored);
});

test('a compaction sets the receipt back to the launch instructions', () => {
    const launched = { deliveredInstructionFingerprint: 'launch_stable' };

    expect(receipt({ kind: 'current' }, { compacted: true })).toMatchObject(launched);
    expect(receipt({ kind: 'deferred' }, { compacted: true })).toMatchObject(launched);
    // Compacted on the update turn itself: the update may be gone, so it goes again.
    expect(receipt(inject, { compacted: true })).toMatchObject(launched);
    expect(receipt(inject, { compacted: true, completed: false })).toMatchObject(launched);
    // A session launched in this turn is on the current instructions either way.
    expect(receipt({ kind: 'fresh' }, { compacted: true })).toMatchObject({
        deliveredInstructionFingerprint: 'new_stable',
        launchedInstructionFingerprint: 'new_stable',
    });
    // A session that predates the launch record re-delivers after any compaction.
    expect(
        deliveredInstructionReceipt(
            { kind: 'current' },
            { ...stored, launchedInstructionFingerprint: null },
            composed,
            { compacted: true, completed: true }
        ).deliveredInstructionFingerprint
    ).toBeNull();
});
