import type { HausOutputs, ServerDetail, ServerSummary } from '../../lib/haus-server.tsx';

/**
 * Fixture answers for every Haus API call the activation surfaces make. The
 * preview renders the real components; only this module knows the data is
 * fake. Slugs and tokens under the `preview-` prefix select scene variants.
 */

type ComputerSummary = HausOutputs['computer']['list'][number];
type ServerOnboarding = ServerDetail['onboarding'];

const queryDelayMs = 250;
const mutationDelayMs = 900;
const previewComputerId = 'cmp_previewfixture1';
const fixedTimestamp = '2026-08-01T09:00:00.000Z';

export const previewServerSummaries: ServerSummary[] = [
    { displayName: 'Haus HQ', id: 'srv_preview_hq', role: 'owner', slug: 'haus-hq' },
    { displayName: 'Side Projects', id: 'srv_preview_side', role: 'member', slug: 'side-projects' },
];

const previewComputer: ComputerSummary = {
    architecture: 'arm64',
    createdAt: fixedTimestamp,
    health: 'healthy',
    id: previewComputerId,
    lastConnectedAt: fixedTimestamp,
    name: 'Zach’s Mac mini',
    operatingSystem: 'macOS 15.5',
    productVersion: '1.3.3',
    protocolVersion: 1,
    reportedInventory: {
        name: 'Zach’s Mac mini',
        runtimes: [
            {
                id: 'codex',
                label: 'Codex',
                models: [
                    { id: 'gpt-5.5', label: 'GPT-5.5' },
                    { id: 'gpt-5.4', label: 'GPT-5.4' },
                    { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
                ],
            },
            {
                id: 'claude-code',
                label: 'Claude Code',
                models: [
                    { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
                    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
                ],
            },
        ],
    },
    updateActiveAgentCount: null,
    updateDetail: null,
    updateDownloadedBytes: null,
    updateFailedPhase: null,
    updatePhase: 'idle',
    updateTargetVersion: null,
    updateTotalBytes: null,
    updateUpdatedAt: null,
};

const onboardingBySlug: Record<string, ServerOnboarding> = {
    'preview-apply-error': onboarding({
        computerId: previewComputerId,
        failure: {
            code: 'application-failed',
            detail: 'Factory acknowledgement failed after workspace seeding.',
        },
        modelId: 'gpt-5.5',
        phase: 'applying',
        runtimeId: 'codex',
    }),
    'preview-apply-failed': onboarding({
        computerId: previewComputerId,
        failure: {
            code: 'computer-disconnected',
            detail: 'The Computer disconnected while Cove was being created.',
        },
        modelId: 'gpt-5.5',
        phase: 'applying',
        runtimeId: 'codex',
    }),
    'preview-applying': onboarding({
        agentId: 'agt_preview_cove',
        computerId: previewComputerId,
        modelId: 'gpt-5.5',
        phase: 'applying',
        runtimeId: 'codex',
    }),
    'preview-member': onboarding({}),
    'preview-admin': onboarding({}),
    'preview-connect-computer': onboarding({}),
    'preview-connect-failed': onboarding({
        failure: {
            code: 'inventory-empty',
            detail: 'Setup stopped before the Computer reported its runtimes.',
        },
    }),
    'preview-detecting': onboarding({ computerId: previewComputerId }),
    'preview-meet-cove': onboarding({ computerId: previewComputerId, phase: 'awaiting-cove' }),
};

export async function resolveActivationFixture(path: string, input: unknown): Promise<unknown> {
    if (path === 'server.bySlug') {
        await wait(queryDelayMs);
        return previewServerDetail(readString(input, 'slug'));
    }
    if (path === 'computer.list') {
        await wait(queryDelayMs);
        return [previewComputer];
    }
    if (path === 'invitation.preview') {
        await wait(queryDelayMs);
        return previewInvitation(readString(input, 'token'));
    }
    if (path === 'computer.login.status') {
        await wait(queryDelayMs);
        return previewLoginStatus(readString(input, 'userCode'));
    }
    if (path === 'computer.login.approve') {
        await wait(mutationDelayMs);
        loginDecisions.set(normalizeLoginCode(readString(input, 'userCode')), {
            decidedAt: Date.now(),
            status: 'approved',
        });
        return { purpose: 'setup', status: 'approved' };
    }
    if (path === 'computer.login.deny') {
        await wait(mutationDelayMs);
        loginDecisions.set(normalizeLoginCode(readString(input, 'userCode')), {
            decidedAt: Date.now(),
            status: 'denied',
        });
        return { status: 'denied' };
    }
    if (path === 'server.create' || path === 'server.createCove' || path === 'invitation.accept') {
        await wait(mutationDelayMs);
        throw new Error('This is a preview — nothing is created here.');
    }
    throw new Error(`No activation preview fixture answers "${path}".`);
}

function previewServerDetail(slug: string): ServerDetail {
    const onboardingState = onboardingBySlug[slug];
    if (!onboardingState) {
        throw new Error(`No Haus server exists at /${slug}.`);
    }
    return {
        avatarGenerationAvailable: false,
        channels: [],
        displayName: 'Haus HQ',
        id: 'srv_preview_hq',
        onboarding: onboardingState,
        role: slug === 'preview-member' ? 'member' : slug === 'preview-admin' ? 'admin' : 'owner',
        // The display slug, not the URL's variant slug, so rendered setup
        // commands read like a real Server's.
        slug: 'haus-hq',
        viewerUserId: 'usr_preview',
    };
}

/** Approve/deny decisions persist per code so the login arc plays out live. */
const loginDecisions = new Map<string, { decidedAt: number; status: 'approved' | 'denied' }>();
const loginConsumeAfterMs = 2500;

function previewLoginStatus(userCode: string) {
    const code = normalizeLoginCode(userCode);
    if (!/^[A-Z]{4}-[A-Z]{4}$/.test(code)) {
        return { status: 'malformed' };
    }
    const decision = loginDecisions.get(code);
    if (decision?.status === 'denied') {
        return { status: 'denied' };
    }
    if (decision?.status === 'approved') {
        // The Computer "finishes its connection" a beat after approval.
        const finished = Date.now() - decision.decidedAt > loginConsumeAfterMs;
        return { purpose: 'setup', status: finished ? 'consumed' : 'approved' };
    }
    if (code === 'GROT-DEMO') {
        return { purpose: 'setup', status: 'pending' };
    }
    if (code === 'GROT-DONE') {
        return { purpose: 'setup', status: 'consumed' };
    }
    if (code === 'GROT-EXPD') {
        return { status: 'expired' };
    }
    return { status: 'not-found' };
}

function normalizeLoginCode(userCode: string): string {
    return userCode.trim().toUpperCase();
}

function previewInvitation(token: string) {
    if (token === 'preview-ready') {
        return { emailMatches: true, serverDisplayName: 'Haus HQ', serverSlug: 'haus-hq' };
    }
    if (token === 'preview-mismatch') {
        return { emailMatches: false, serverDisplayName: 'Haus HQ', serverSlug: 'haus-hq' };
    }
    throw new Error('This invitation is no longer valid.');
}

function onboarding(overrides: Partial<ServerOnboarding>): ServerOnboarding {
    return {
        agentId: null,
        applicationId: null,
        channelId: 'chat_preview_channel',
        computerId: null,
        failure: null,
        modelId: null,
        phase: 'awaiting-computer',
        runtimeId: null,
        ...overrides,
    };
}

function readString(input: unknown, key: string): string {
    if (input && typeof input === 'object' && key in input) {
        const value = (input as Record<string, unknown>)[key];
        if (typeof value === 'string') {
            return value;
        }
    }
    return '';
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
