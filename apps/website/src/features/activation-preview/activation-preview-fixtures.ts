import type { ServerSummary } from '../../lib/haus-server.tsx';

/**
 * Fixture answers for every Haus API call the activation surfaces make. The
 * preview renders the real components; only this module knows the data is
 * fake. Slugs and tokens under the `preview-` prefix select scene variants.
 */

const queryDelayMs = 250;
const mutationDelayMs = 900;

export const previewServerSummaries: ServerSummary[] = [
    { displayName: 'Haus HQ', id: 'srv_preview_hq', role: 'owner', slug: 'haus-hq' },
    { displayName: 'Side Projects', id: 'srv_preview_side', role: 'member', slug: 'side-projects' },
];

export async function resolveActivationFixture(path: string, input: unknown): Promise<unknown> {
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
    if (path === 'server.create' || path === 'invitation.accept') {
        await wait(mutationDelayMs);
        throw new Error('This is a preview — nothing is created here.');
    }
    throw new Error(`No activation preview fixture answers "${path}".`);
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
