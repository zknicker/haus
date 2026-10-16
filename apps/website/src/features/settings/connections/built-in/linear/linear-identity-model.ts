import type { LinearIdentity, LinearWorkspace } from '@haus/api';
import { formatRelativeTime } from '../../../../../lib/format.ts';

/** The next step a row's identity line offers, as an inline link. */
export type LinearIdentityStep = 'continue' | 'give' | 'reinstall';
/** What an installed identity's menu (opened from its handle) does. */
export type LinearIdentityMenuAction = 'remove' | 'rotate-secret';
export type LinearIdentityAction = LinearIdentityMenuAction | LinearIdentityStep;

/**
 * A granted Agent's identity line: `fact` · `details` · `step`. Every
 * control lives on this line, so the row's trailing side stays the access
 * switch alone.
 */
export interface LinearIdentityRow {
    /** Plain facts after the main one, such as last delivery or a state. */
    details: readonly string[];
    /** How the Agent posts; for an installed identity it opens `menu`. */
    fact: string;
    /** Empty for an Agent without an installed identity: its fact is plain text. */
    menu: readonly LinearIdentityMenuAction[];
    /** The next step, if the line asks for one. */
    step: LinearIdentityStep | null;
}

/**
 * One granted Agent's identity state. Without an identity (or with a removed
 * one) it posts through the Haus app and its next step is giving it its own;
 * a draft's next step is finishing that. Connecting an app made earlier is
 * the setup's own alternate path, not a row action. A live identity names
 * its handle, which opens its menu, and when Linear last reached it.
 */
export function linearIdentityRow(
    identity: Pick<LinearIdentity, 'handle' | 'lastDeliveryAt' | 'status'> | null,
    now = Date.now()
): LinearIdentityRow {
    const viaHaus = 'Posts via Haus';
    if (!identity || identity.status === 'removed') {
        return { details: [], fact: viaHaus, menu: [], step: 'give' };
    }
    if (identity.status === 'draft') {
        return { details: [], fact: viaHaus, menu: [], step: 'continue' };
    }
    const fact = identity.handle ? `Posts as @${identity.handle}` : 'Posts as its own app';
    const delivery = identity.lastDeliveryAt
        ? [`Last delivery ${formatRelativeTime(identity.lastDeliveryAt, now)}`]
        : [];
    const menu = ['rotate-secret', 'remove'] as const;
    switch (identity.status) {
        case 'active':
            return { details: delivery, fact, menu, step: null };
        case 'inactive':
            return { details: [...delivery, 'Inactive'], fact, menu, step: null };
        case 'refresh_required':
            return { details: ['Sign in required'], fact, menu, step: 'reinstall' };
        default:
            return { details: ['Revoked'], fact, menu, step: 'reinstall' };
    }
}

/** The live identity an Agent holds in this workspace, if any. */
export function identityForAgent(identities: readonly LinearIdentity[], agentId: string) {
    return (
        identities.find(
            (identity) => identity.agentId === agentId && identity.status !== 'removed'
        ) ?? null
    );
}

/** The workspace's one exceptional state; `active` is the norm and carries no chip. */
export function linearWorkspaceStatus(
    status: LinearWorkspace['status']
): { color: 'danger' | 'default' | 'warning'; label: string } | null {
    switch (status) {
        case 'active':
            return null;
        case 'refresh_required':
            return { color: 'warning', label: 'Sign in required' };
        case 'revoked':
            return { color: 'danger', label: 'Revoked in Linear' };
        case 'disconnected':
            return { color: 'default', label: 'Disconnected' };
        default:
            return { color: 'default', label: 'Removed' };
    }
}
