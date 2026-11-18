import * as React from 'react';
import { useAppAuth } from '../../lib/app-auth.tsx';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { deviceTimezone } from '../../lib/timezones.ts';

/**
 * Reports the signed-in human's profile and device timezone once per
 * session so other members see a name instead of an opaque id, and Agents can
 * schedule in the human's zone. The Server only fills blanks, so this never
 * overwrites a name or timezone the human has chosen.
 */
export function SyncHumanIdentity({ serverId }: { serverId: string | undefined }) {
    const { session } = useAppAuth();
    const sync = hausTrpc.member.syncIdentity.useMutation();
    const syncMutate = sync.mutate;
    const syncedRef = React.useRef<string | null>(null);
    const user = session?.user;

    React.useEffect(() => {
        if (!(serverId && user)) {
            return;
        }
        const key = `${serverId}:${user.id}`;
        if (syncedRef.current === key) {
            return;
        }

        syncedRef.current = key;
        syncMutate({
            name: user.displayName,
            serverId,
            timezone: deviceTimezone(),
        });
    }, [serverId, syncMutate, user]);

    return null;
}
