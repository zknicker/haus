import { serverStreamInputSchema } from '@haus/api';
import { toMembershipLossError } from '../haus-api/server/membership-loss.ts';
import { memberProcedure } from '../haus-api/server/procedure.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { ServerRole } from '../servers/contracts.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { membershipLostError, roleRequiredError } from './refusal.ts';
import { streamTopic } from './stream-topic.ts';
import type { RealtimeTopic } from './topic.ts';

export interface RealtimeAccess {
    db: HausDatabase;
    member: HausUser;
}

export interface RealtimeSubscriptionOptions<Event extends { serverId: string }> {
    /**
     * The stream's role authority beyond membership. A role that fails it is
     * refused with `role_required`, at start and on every delivery.
     */
    authorize?: { allows(role: ServerRole): boolean; message: string };
    /**
     * Per-event visibility beyond Server and audience (Chat access). False skips
     * the event without ending the stream.
     */
    deliver?: (access: RealtimeAccess, event: Event) => Promise<boolean>;
    topic: RealtimeTopic<Event>;
}

/**
 * Builds one Server-rooted realtime stream (specs/realtime-events.md,
 * "Subscription factory"): authorize at start, filter per event, recheck
 * membership and role before every delivery, code the two refusals, and end
 * only this stream (logged) on any unexpected error.
 */
export function realtimeSubscription<Event extends { serverId: string }>(
    options: RealtimeSubscriptionOptions<Event>
) {
    const { authorize, deliver, topic } = options;

    return memberProcedure
        .input(serverStreamInputSchema)
        .use(async ({ ctx, input, next }) => {
            await requireStreamAccess(ctx, input.serverId, authorize);
            return await next();
        })
        .subscription(({ ctx, input, path, signal }) =>
            streamTopic({
                access: async () => ({
                    db: ctx.hausDb,
                    member: await requireStreamAccess(ctx, input.serverId, authorize),
                }),
                deliver,
                path,
                serverId: input.serverId,
                signal,
                topic,
                viewerId: ctx.member?.id ?? null,
            })
        );
}

/** Membership first (`membership_lost`), then the stream's role (`role_required`). */
async function requireStreamAccess(
    ctx: { hausDb: HausDatabase; member: HausUser | null },
    serverId: string,
    authorize: RealtimeSubscriptionOptions<{ serverId: string }>['authorize']
): Promise<HausUser> {
    let role: ServerRole;
    try {
        ({ role } = await requireServerMembership(ctx.hausDb, ctx.member, serverId));
    } catch (cause) {
        throw toMembershipLossError(cause) ?? cause;
    }
    if (!ctx.member) {
        throw membershipLostError();
    }
    if (authorize && !authorize.allows(role)) {
        throw roleRequiredError(authorize.message);
    }
    return ctx.member;
}
