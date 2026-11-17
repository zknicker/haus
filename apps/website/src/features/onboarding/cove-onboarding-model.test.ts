import { describe, expect, test } from 'bun:test';
import {
    getCoveOnboardingView,
    getCoveRepairGuidance,
    resolveCoveAppHandoff,
} from './cove-onboarding-model.ts';

describe('Cove onboarding phase-to-view mapping', () => {
    test('shows the Computer connection action before a Computer connects', () => {
        expect(
            getCoveOnboardingView({
                agentId: null,
                applicationId: null,
                channelId: 'cht_onboarding',
                computerId: null,
                failure: null,
                modelId: null,
                phase: 'awaiting-computer',
                runtimeId: null,
            })
        ).toBe('connect-computer');
    });

    test('shows live detection progress after a Computer connects', () => {
        expect(
            getCoveOnboardingView({
                agentId: null,
                applicationId: null,
                channelId: 'cht_onboarding',
                computerId: 'cmp_first',
                failure: null,
                modelId: null,
                phase: 'awaiting-computer',
                runtimeId: null,
            })
        ).toBe('detecting-runtimes');
    });

    test('keeps Computer failures on the repairable connection view', () => {
        expect(
            getCoveOnboardingView({
                agentId: null,
                applicationId: null,
                channelId: 'cht_onboarding',
                computerId: 'cmp_first',
                failure: {
                    code: 'inventory-empty',
                    detail: 'No usable runtime and model were reported.',
                },
                modelId: null,
                phase: 'awaiting-computer',
                runtimeId: null,
            })
        ).toBe('connect-failed');
    });

    test('advances only durable awaiting-Cove state to Meet Cove', () => {
        expect(
            getCoveOnboardingView({
                agentId: null,
                applicationId: null,
                channelId: 'cht_onboarding',
                computerId: 'cmp_first',
                failure: null,
                modelId: null,
                phase: 'awaiting-cove',
                runtimeId: null,
            })
        ).toBe('meet-cove');
    });

    test('keeps application progress gated until the Computer acknowledgement', () => {
        expect(
            getCoveOnboardingView({
                agentId: 'agt_cove',
                applicationId: 'cap_apply',
                channelId: 'cht_onboarding',
                computerId: 'cmp_first',
                failure: null,
                modelId: 'gpt-5.6-sol',
                phase: 'applying',
                runtimeId: 'codex',
            })
        ).toBe('applying-cove');
    });

    test('maps application and disconnect failures to Cove repair without unlocking', () => {
        expect(
            getCoveOnboardingView({
                agentId: 'agt_cove',
                applicationId: 'cap_apply',
                channelId: 'cht_onboarding',
                computerId: 'cmp_first',
                failure: { code: 'application-failed', detail: 'Workspace seed failed.' },
                modelId: 'gpt-5.6-sol',
                phase: 'applying',
                runtimeId: 'codex',
            })
        ).toBe('apply-failed');
    });

    test('unlocks the general App only for durable completion', () => {
        expect(
            getCoveOnboardingView({
                agentId: 'agt_cove',
                applicationId: 'cap_apply',
                channelId: 'cht_onboarding',
                computerId: 'cmp_first',
                failure: null,
                modelId: 'gpt-5.6-sol',
                phase: 'complete',
                runtimeId: 'codex',
            })
        ).toBe('app');
    });
});

describe('Cove onboarding presentation boundary', () => {
    test('never exposes internal application diagnostics to the human', () => {
        const guidance = getCoveRepairGuidance({
            code: 'application-failed',
            detail: 'Factory acknowledgement failed after workspace seeding.',
        });

        const visible = [guidance.title, guidance.remedy, guidance.command, guidance.note].join(
            ' '
        );
        expect(visible).not.toMatch(/factory|acknowledg|workspace|seed|configuration/iu);
        expect(guidance.remedy).toContain('Try again');
        expect(guidance.command).toBe('haus-computer logs');
    });

    test('gives a disconnected Computer the exact recovery command', () => {
        const guidance = getCoveRepairGuidance({
            code: 'computer-disconnected',
            detail: 'Internal socket report detail.',
        });

        expect(guidance.title).toBe('This Computer is offline');
        expect(guidance.command).toBe('haus-computer start');
        expect(guidance.note).toContain('continues automatically');
    });

    test('routes update-shaped failures to the upgrade command', () => {
        for (const code of ['computer-incompatible', 'inventory-invalid'] as const) {
            expect(getCoveRepairGuidance({ code, detail: 'internal' }).command).toBe(
                'haus-computer upgrade'
            );
        }
    });

    test('falls back to a safe generic repair without a failure record', () => {
        const guidance = getCoveRepairGuidance(null);

        expect(guidance.command).toBeNull();
        expect(guidance.remedy).toContain('try again');
    });
});

test('completed onboarding redirects once, then releases ordinary Chat navigation', () => {
    expect(
        resolveCoveAppHandoff({
            onboardingChatPath: '/s/fresh/chats/onboarding',
            pathname: '/s/fresh',
            pending: true,
        })
    ).toEqual({ redirect: '/s/fresh/chats/onboarding' });

    expect(
        resolveCoveAppHandoff({
            onboardingChatPath: '/s/fresh/chats/onboarding',
            pathname: '/s/fresh/chats/general',
            pending: false,
        })
    ).toEqual({ redirect: null });
});

test('a later visit to the Server root lands on the Server index, not the onboarding chat', () => {
    expect(
        resolveCoveAppHandoff({
            onboardingChatPath: '/s/fresh/chats/onboarding',
            pathname: '/s/fresh',
            pending: false,
        })
    ).toEqual({ redirect: null });
});
