import { type RealtimeRefusal, realtimeRefusalDataKey } from '@haus/api';
import { TRPCError } from '@trpc/server';

/**
 * A coded realtime refusal (specs/realtime-events.md, "Refusal classes"). The
 * tRPC `errorFormatter` exposes `refusal` under `realtimeRefusalDataKey`, so the
 * App can tell a final membership loss from a role refusal or a transient
 * failure. Only membership and role checks raise one.
 *
 * It deliberately carries no `cause`: the Server procedure middleware remaps
 * errors by cause class, and remapping would drop the code.
 */
export class RealtimeRefusalError extends TRPCError {
    readonly refusal: RealtimeRefusal;

    constructor(refusal: RealtimeRefusal, message: string) {
        super({ code: 'FORBIDDEN', message });
        this.name = 'RealtimeRefusalError';
        this.refusal = refusal;
    }
}

export function membershipLostError(message = 'You are no longer a member of this Haus server.') {
    return new RealtimeRefusalError('membership_lost', message);
}

export function roleRequiredError(message: string) {
    return new RealtimeRefusalError('role_required', message);
}

/** The `data` field the tRPC error shape carries for every error. */
export function realtimeRefusalData(error: unknown) {
    return {
        [realtimeRefusalDataKey]: error instanceof RealtimeRefusalError ? error.refusal : undefined,
    };
}
