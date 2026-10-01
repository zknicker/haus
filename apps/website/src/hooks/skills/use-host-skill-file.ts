import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/** Reads a host-installed skill's SKILL.md live from its Computer; nothing is cached on the Server. */
export function useHostSkillFile({
    computerId,
    serverId,
    sourceId,
}: {
    computerId: string;
    serverId: string;
    sourceId: string | null;
}) {
    return hausTrpc.computer.skillFile.useQuery(
        { computerId, serverId, sourceId: sourceId ?? '' },
        // A live relay read: a silent Computer already took the 30s relay
        // timeout, so retrying only stacks more of them before the error shows.
        { ...queryPolicy.computerSnapshot, enabled: sourceId !== null, retry: false }
    );
}
