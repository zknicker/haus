import { membershipLostError, type RealtimeRefusalError } from '../../realtime/refusal.ts';
import { ServerAccessDeniedError, ServerNotFoundError } from '../../servers/server-access.ts';

/**
 * Translates a failed membership check on a realtime stream into the coded
 * `membership_lost` refusal (FORBIDDEN).
 *
 * The App treats this code as proof the human lost access and drops everything
 * it has cached about the Server, which makes the translation deliberately
 * narrow: only the two membership refusals qualify. A deleted Server reads as
 * not found and is a membership loss too. A database or transport failure
 * returns null so the caller rethrows it as the internal failure it is —
 * misreporting one as a refusal would purge a still-valid member's Chats on a
 * transient hiccup.
 */
export function toMembershipLossError(cause: unknown): RealtimeRefusalError | null {
    if (cause instanceof ServerAccessDeniedError || cause instanceof ServerNotFoundError) {
        return membershipLostError(cause.message, cause);
    }

    return null;
}
