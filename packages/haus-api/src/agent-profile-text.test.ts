import { expect, test } from 'bun:test';
import { agentSchema } from './agent.ts';
import { agentCreateAgentInputSchema, agentUpdateAgentInputSchema } from './agent-creation.ts';
import { agentStartCommandSchema } from './agent-delivery-frames.ts';
import { updateAgentProfileInputSchema } from './agent-profile.ts';
import {
    AGENT_DESCRIPTION_MAX_LENGTH,
    AGENT_DESCRIPTION_STORED_MAX_LENGTH,
    agentDescriptionInputSchema,
    agentDescriptionTooLongMessage,
    isAgentDescriptionWriteAllowed,
} from './agent-profile-text.ts';

const atLimit = 'x'.repeat(AGENT_DESCRIPTION_MAX_LENGTH);
const overLimit = `${atLimit}x`;

test('new descriptions stop at the role-line limit with a message that says why', () => {
    expect(agentDescriptionInputSchema.parse(` ${atLimit} `)).toBe(atLimit);
    const refused = agentDescriptionInputSchema.safeParse(overLimit);
    expect(refused.success).toBe(false);
    expect(refused.error?.issues[0]?.message).toBe(agentDescriptionTooLongMessage);
    expect(
        agentCreateAgentInputSchema.safeParse({
            content: 'Meet @orbit.',
            description: overLimit,
            displayName: 'Orbit',
            nonce: 'n',
            target: '#all',
        }).success
    ).toBe(false);
});

test('updates admit the stored bound; only a changed description must fit the cap', () => {
    const storedMax = 'x'.repeat(AGENT_DESCRIPTION_STORED_MAX_LENGTH);
    const profile = { agentId: 'agt_1', displayName: 'Orbit', serverId: 'srv_1' };
    expect(
        updateAgentProfileInputSchema.safeParse({ ...profile, description: storedMax }).success
    ).toBe(true);
    expect(
        updateAgentProfileInputSchema.safeParse({ ...profile, description: `${storedMax}x` })
            .success
    ).toBe(false);
    expect(
        agentUpdateAgentInputSchema.safeParse({ agent: '@orbit', description: storedMax }).success
    ).toBe(true);

    expect(isAgentDescriptionWriteAllowed(overLimit, overLimit)).toBe(true);
    expect(isAgentDescriptionWriteAllowed(overLimit, atLimit)).toBe(false);
    expect(isAgentDescriptionWriteAllowed(overLimit, null)).toBe(false);
    expect(isAgentDescriptionWriteAllowed(atLimit, null)).toBe(true);
    expect(isAgentDescriptionWriteAllowed(null, overLimit)).toBe(true);
});

test('stored descriptions written before the limit still read back', () => {
    expect(agentSchema.shape.description.safeParse('x'.repeat(500)).success).toBe(true);
});

test('a profile update may omit, set, or clear the personality, within its cap', () => {
    const base = { agentId: 'agt_1', description: null, displayName: 'Orbit', serverId: 'srv_1' };
    expect(updateAgentProfileInputSchema.parse(base).personality).toBeUndefined();
    expect(
        updateAgentProfileInputSchema.parse({ ...base, personality: '  Terse.  ' }).personality
    ).toBe('Terse.');
    expect(
        updateAgentProfileInputSchema.parse({ ...base, personality: null }).personality
    ).toBeNull();
    expect(
        updateAgentProfileInputSchema.safeParse({ ...base, personality: 'x'.repeat(2001) }).success
    ).toBe(false);
});

test('the start frame carries an optional personality', () => {
    const frame = {
        agentId: 'agt_1',
        chatId: 'cht_1',
        inboxDelivery: 'notice',
        modelId: 'm',
        runId: 'run_1',
        runtimeId: 'codex',
        sessionGeneration: 1,
        totalPending: 0,
        type: 'start',
    };
    expect(agentStartCommandSchema.parse(frame).agentPersonality).toBeUndefined();
    expect(
        agentStartCommandSchema.parse({ ...frame, agentPersonality: 'Terse.' }).agentPersonality
    ).toBe('Terse.');
});
