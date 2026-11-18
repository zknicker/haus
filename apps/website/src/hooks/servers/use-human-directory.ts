import * as React from 'react';
import { humanDirectory } from '../../features/servers/human-identity.ts';
import { useMembers } from './use-members.ts';

/**
 * Names and faces for humans a surface only knows by id. Backed by the member
 * directory the workspace already returns, so a transcript author, a claim
 * assignee, and the members page never disagree about who someone is.
 */
export function useHumanDirectory(serverId: string | undefined, options?: { enabled?: boolean }) {
    const directory = useMembers(serverId, options);
    const members = directory.data?.members;
    const viewerUserId = directory.data?.viewerUserId;

    return React.useMemo(
        () => humanDirectory(members ?? [], viewerUserId),
        [members, viewerUserId]
    );
}
