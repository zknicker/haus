import { useUser } from '@clerk/clerk-react';
import * as React from 'react';
import { isClerkEnabled } from '../../lib/clerk.tsx';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { deviceTimezone } from '../../lib/timezones.ts';

/**
 * Reports the signed-in human's Clerk identity and device timezone once per
 * session so other members see a name instead of an opaque id, and Agents can
 * schedule in the human's zone. The Server only fills blanks, so this never
 * overwrites a name or timezone the human has chosen.
 */
export function SyncHumanIdentity({ serverId }: { serverId: string | undefined }) {
    if (!isClerkEnabled) {
        return null;
    }

    return <ClerkHumanIdentitySync serverId={serverId} />;
}

function ClerkHumanIdentitySync({ serverId }: { serverId: string | undefined }) {
    const { isSignedIn, user } = useUser();
    const sync = hausTrpc.member.syncIdentity.useMutation();
    const syncMutate = sync.mutate;
    const syncedRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        if (!(serverId && isSignedIn && user) || syncedRef.current === serverId) {
            return;
        }

        syncedRef.current = serverId;
        syncMutate({
            email: user.primaryEmailAddress?.emailAddress ?? null,
            name: user.fullName ?? null,
            serverId,
            timezone: deviceTimezone(),
        });
    }, [isSignedIn, serverId, syncMutate, user]);

    return null;
}
