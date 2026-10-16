import type { LinearIdentity } from '@haus/api';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useLinearSetupOutcome } from '../../../../../hooks/linear/use-linear-setup-outcome.ts';
import { identityInstalledOutcome } from './linear-setup-notice-model.ts';

const highlightMs = 2400;
/** Per-viewer: which identity this browser last sent to Linear to install. */
const pendingInstallKey = 'haus.linear.pendingIdentityInstall';

/**
 * Remembers the identity an install is about to authorize, so the tab
 * Linear's callback lands in can find its Agent. Best effort: storage may be
 * unavailable, and the page that started the install sees the change live.
 */
export function rememberLinearIdentityInstall(identityId: string) {
    try {
        window.localStorage.setItem(pendingInstallKey, identityId);
    } catch {
        // No storage: the row still updates live in the starting page.
    }
}

/**
 * The Agent whose identity just finished installing, for a moment, so its
 * row can scroll into view and mark its new handle. Seen two ways: this page
 * watched the identity turn `active`, or the page is Linear's callback
 * landing (`?linear_setup=identity_installed`) for the install this browser
 * remembered. The callback's outcome is consumed here, not shown as a notice.
 */
export function useLinearIdentityArrival(identities: readonly LinearIdentity[] | undefined) {
    const { dismiss, outcome } = useLinearSetupOutcome();
    const previous = useRef<ReadonlyMap<string, LinearIdentity['status']> | null>(null);
    const [arrived, setArrived] = useState<string | null>(null);

    const consumeOutcome = useEffectEvent(() => {
        if (outcome !== identityInstalledOutcome) {
            return null;
        }
        dismiss();
        return takePendingInstall();
    });

    useEffect(() => {
        if (!identities) {
            return;
        }
        const before = previous.current;
        previous.current = new Map(identities.map((identity) => [identity.id, identity.status]));
        const agentId = linearIdentityArrival(before, identities, consumeOutcome());
        if (agentId) {
            setArrived(agentId);
        }
    }, [identities]);

    useEffect(() => {
        if (!arrived) {
            return;
        }
        const timer = window.setTimeout(() => setArrived(null), highlightMs);
        return () => window.clearTimeout(timer);
    }, [arrived]);

    return arrived;
}

/**
 * The Agent whose identity arrived: one that turned from `draft` to `active`
 * since the last list, or else the remembered install once it is `active`.
 */
export function linearIdentityArrival(
    before: ReadonlyMap<string, LinearIdentity['status']> | null,
    identities: readonly Pick<LinearIdentity, 'agentId' | 'id' | 'status'>[],
    pendingIdentityId: string | null
): string | null {
    const turned = before
        ? identities.find(
              (identity) => identity.status === 'active' && before.get(identity.id) === 'draft'
          )
        : undefined;
    const landed = identities.find(
        (identity) => identity.id === pendingIdentityId && identity.status === 'active'
    );
    return (turned ?? landed)?.agentId ?? null;
}

function takePendingInstall() {
    try {
        const identityId = window.localStorage.getItem(pendingInstallKey);
        window.localStorage.removeItem(pendingInstallKey);
        return identityId;
    } catch {
        return null;
    }
}
