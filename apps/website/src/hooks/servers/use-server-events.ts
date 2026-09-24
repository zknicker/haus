import type { ServerUpdatedEvent } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { cachesClearedOnMembershipLoss } from './membership-caches.ts';
import { isMembershipLoss } from './membership-loss.ts';

/**
 * Keeps the open Haus server current while it changes on the Server. This
 * subscription owns every invalidation a Server-level change implies, including
 * membership: a role change or a departure alters the directory, the viewer's
 * own standing, and which Servers they can open.
 *
 * The Server refuses delivery once membership ends, so a removed human's
 * subscription errors instead of quietly going silent, and the surrounding
 * route falls back to its unavailable state.
 */
export function useServerEvents(serverId: string | undefined, slug: string | undefined) {
    const utils = hausTrpc.useUtils();

    hausTrpc.server.onUpdate.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined,
            onData: createServerUpdateHandler(utils, serverId, slug),
            onError: (error) => {
                if (!isMembershipLoss(error)) {
                    return;
                }

                // Losing membership arrives as a refusal, never as data, so
                // nothing invalidates on its own. Every Server cache naming this
                // Server is cleared rather than invalidated: dropping the data
                // outright is what stops a removed human seeing Chats, the
                // directory, or the Server in their list while a refetch runs or
                // the connection is gone. The refetch that follows fails closed
                // into the route's unavailable state.
                for (const cache of cachesClearedOnMembershipLoss(utils)) {
                    void cache.reset();
                }
            },
        }
    );
}

type ServerEventUtils = ReturnType<typeof hausTrpc.useUtils>;

/**
 * One Server's realtime notice, as this listener reads it. The ids are the
 * event's own precision: present when the change belongs to one Agent,
 * Computer, or human, absent when the whole scope must refresh.
 */
type ServerUpdateNotice = Pick<ServerUpdatedEvent, 'agentId' | 'computerId' | 'memberId' | 'scope'>;

/**
 * Each subscription watches one Server, so `slug` names the only Server detail
 * this listener may invalidate — a change on one Server must not refetch every
 * other open Server's detail read.
 */
export function createServerUpdateHandler(
    utils: ServerEventUtils,
    serverId: string | undefined,
    slug: string | undefined
) {
    return (event: ServerUpdateNotice) => {
        if (event.scope === 'agent') {
            invalidateServerDetail(utils, slug);
            invalidateAgentDetail(utils, serverId, event.agentId);
            void utils.agent.list.invalidate({ serverId });
            void utils.chat.list.invalidate({ serverId });
            return;
        }
        if (event.scope === 'computer') {
            invalidateServerDetail(utils, slug);
            void utils.computer.list.invalidate({ serverId });
            void (event.computerId
                ? utils.computer.systemLog.invalidate(
                      { computerId: event.computerId, serverId },
                      { exact: false }
                  )
                : utils.computer.systemLog.invalidate(undefined, { exact: false }));
            void utils.agent.activeActivity.invalidate({ serverId });
            invalidateAgentDetail(utils, serverId, event.agentId);
            void utils.agent.list.invalidate({ serverId });
            void utils.agent.skillFile.invalidate();
            void utils.agent.workspaceFile.invalidate();
            void utils.agent.workspaceFiles.invalidate();
            void utils.stats.live.invalidate({ serverId });
            return;
        }
        if (event.scope === 'mcp') {
            void utils.mcp.list.invalidate({ serverId });
            void utils.mcp.amazonProducts.invalidate({ serverId });
            void utils.mcp.amazonProductDetail.invalidate({ serverId });
            return;
        }

        invalidateServerDetail(utils, slug);
        void utils.server.list.invalidate();
        invalidateMemberDetail(utils, serverId, event.memberId);
        void utils.member.list.invalidate({ serverId });
        void utils.invitation.list.invalidate({ serverId });
    };
}

/** Without a known slug the detail read cannot be named, so every one refreshes. */
function invalidateServerDetail(utils: ServerEventUtils, slug: string | undefined) {
    void (slug ? utils.server.bySlug.invalidate({ slug }) : utils.server.bySlug.invalidate());
}

/**
 * A named Agent refreshes its own detail and delivery state; delivery state is
 * what Start, Stop, Restart, and Reset actually change. An unnamed one means the
 * roster moved, so every cached Agent detail is stale.
 */
function invalidateAgentDetail(
    utils: ServerEventUtils,
    serverId: string | undefined,
    agentId: string | undefined
) {
    if (!agentId) {
        void utils.agent.get.invalidate(undefined, { exact: false });
        return;
    }

    void utils.agent.get.invalidate({ agentId, serverId });
    void utils.agent.deliveryState.invalidate({ agentId, serverId });
}

/** A named human refreshes only their own directory record. */
function invalidateMemberDetail(
    utils: ServerEventUtils,
    serverId: string | undefined,
    memberId: string | undefined
) {
    void (memberId
        ? utils.member.get.invalidate({ serverId, userId: memberId })
        : utils.member.get.invalidate(undefined, { exact: false }));
}
