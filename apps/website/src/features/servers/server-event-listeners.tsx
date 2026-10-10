import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useLocation } from 'react-router-dom';
import { useMemberUpdateStream } from '../../hooks/realtime/use-member-update-stream.ts';
import { useServerUpdateStream } from '../../hooks/realtime/use-server-update-stream.ts';
import { forgiveRelistedServers } from '../../hooks/servers/server-loss.ts';
import { useServer } from '../../hooks/servers/use-server.ts';
import { useServerList } from '../../hooks/servers/use-server-list.ts';
import {
    type ServerEventTarget,
    serverEventTargets,
    serverSlugFromPath,
} from './server-event-model.ts';

/**
 * `server.onUpdated` and `member.onUpdated` for every accessible Server, across
 * every route, so renames, departures, and deletions of Servers other than the
 * open one still land. The current route contributes its Server before the
 * list resolves. A Server lost to a membership refusal reopens its streams only
 * once a newer Server list names it again (a re-invite).
 */
export function ServerEventListeners() {
    const location = useLocation();
    const queryClient = useQueryClient();
    const servers = useServerList();
    const openSlug = serverSlugFromPath(location.pathname);
    const openServer = useServer(openSlug ?? '', openSlug !== null);
    const targets = serverEventTargets(servers.data ?? [], openServer.data);
    const listedIds = (servers.data ?? []).map((server) => server.id).join(' ');

    React.useEffect(() => {
        if (listedIds) {
            forgiveRelistedServers(queryClient, listedIds.split(' '), servers.dataUpdatedAt);
        }
    }, [listedIds, queryClient, servers.dataUpdatedAt]);

    return (
        <>
            {targets.map((target) => (
                <React.Fragment key={target.id}>
                    <ServerUpdateStream id={target.id} slug={target.slug} />
                    <MemberUpdateStream id={target.id} slug={target.slug} />
                </React.Fragment>
            ))}
        </>
    );
}

const ServerUpdateStream = React.memo(function ServerUpdateStream({ id, slug }: ServerEventTarget) {
    useServerUpdateStream({ id, slug });
    return null;
});

const MemberUpdateStream = React.memo(function MemberUpdateStream({ id, slug }: ServerEventTarget) {
    useMemberUpdateStream({ id, slug });
    return null;
});
