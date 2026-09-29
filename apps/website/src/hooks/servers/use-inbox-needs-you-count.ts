import { useNeedsYou } from './use-needs-you.ts';

/**
 * How many Needs you rows wait on this human, for surfaces that badge the
 * Inbox instead of opening it. It reads the same query the Inbox section
 * renders, so the badge and the section never disagree, and it reports zero
 * until that read settles.
 */
export function useInboxNeedsYouCount(serverId: string | undefined): {
    count: number;
    isReady: boolean;
} {
    const needsYou = useNeedsYou(serverId);

    return { count: needsYou.data?.length ?? 0, isReady: needsYou.data !== undefined };
}
