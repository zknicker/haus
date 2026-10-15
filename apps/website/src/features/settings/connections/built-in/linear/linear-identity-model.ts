import type { LinearIdentity, LinearWorkspace } from '@haus/api';
import { formatRelativeTime } from '../../../../../lib/format.ts';

/** What a roster row's menu can do for one Agent. */
export type LinearIdentityAction =
    | 'connect-existing'
    | 'continue'
    | 'give'
    | 'reinstall'
    | 'remove';

export interface LinearIdentityRow {
    actions: readonly LinearIdentityAction[];
    description: string;
    /** The one exceptional state the row names; the norm carries no chip. */
    status: { color: 'danger' | 'default' | 'warning'; label: string } | null;
}

/**
 * One granted Agent's identity state. Without an identity (or with a removed
 * one) it posts through the Haus app; a live identity names its handle and
 * when Linear last reached it.
 */
export function linearIdentityRow(
    agentName: string,
    identity: Pick<LinearIdentity, 'handle' | 'lastDeliveryAt' | 'status'> | null,
    now = Date.now()
): LinearIdentityRow {
    const viaHaus = `Posts as ${agentName} via Haus`;
    if (!identity || identity.status === 'removed') {
        return { actions: ['give', 'connect-existing'], description: viaHaus, status: null };
    }
    if (identity.status === 'draft') {
        return {
            actions: ['continue', 'remove'],
            description: viaHaus,
            status: { color: 'default', label: 'Setup not finished' },
        };
    }
    const named = identity.handle ? `Linear identity: @${identity.handle}` : 'Linear identity';
    const description = identity.lastDeliveryAt
        ? `${named} · Last delivery ${formatRelativeTime(identity.lastDeliveryAt, now)}`
        : named;
    switch (identity.status) {
        case 'active':
            return { actions: ['remove'], description, status: null };
        case 'inactive':
            return {
                actions: ['remove'],
                description,
                status: { color: 'default', label: 'Inactive' },
            };
        case 'refresh_required':
            return {
                actions: ['reinstall', 'remove'],
                description,
                status: { color: 'warning', label: 'Sign in required' },
            };
        default:
            return {
                actions: ['reinstall', 'remove'],
                description,
                status: { color: 'danger', label: 'Revoked' },
            };
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
