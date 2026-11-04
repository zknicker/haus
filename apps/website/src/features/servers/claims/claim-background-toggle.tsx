import { Button } from '@heroui/react';
import { useClaims } from '../../../hooks/servers/use-claims.ts';
import { useServerContext } from '../server-context.ts';
import { useClaimView } from './claim-view.ts';

/**
 * The one way into the background tier.
 *
 * An Agent's claim on work it finished inside one turn is bookkeeping, not
 * something a person tracks, so the Board and List hide it — but hiding it
 * silently would make the page lie about how much it holds. The list read
 * reports how many it hid, so the affordance states the count and nothing
 * else, and disappears entirely on a Server with no background claims.
 */
export function ClaimBackgroundToggle() {
    const { server } = useServerContext();
    const { filters, setBackground } = useClaimView();
    // The same query key the views read, so this costs no extra round trip.
    const claims = useClaims(server.id, filters.chatId ?? undefined, {
        includeBackground: filters.background,
    });
    const hidden = claims.data?.backgroundCount ?? 0;
    const shown = filters.background
        ? (claims.data?.claims.filter((item) => item.claim.tier === 'background').length ?? 0)
        : 0;
    const count = filters.background ? shown : hidden;

    if (count === 0) {
        return null;
    }

    return (
        <Button
            className="text-muted"
            onPress={() => setBackground(!filters.background)}
            size="sm"
            variant="ghost"
        >
            <span className="tabular-nums">{count}</span>
            {filters.background ? ' background shown' : ' background'}
        </Button>
    );
}
