import { CheckListIcon } from '@hugeicons-pro/core-stroke-rounded';
import type { AppCommandGroup } from './types.ts';

/**
 * The one claim command that is not a destination: whether Chat states the
 * claims Agents take for themselves. It reads as what pressing it does, so the
 * palette says `Hide claims in chat` while they are showing.
 */
export function buildClaimCommandGroup({
    setShowClaimsInChat,
    showClaimsInChat,
}: {
    setShowClaimsInChat: (enabled: boolean) => void;
    showClaimsInChat: boolean;
}): AppCommandGroup {
    return {
        commands: [
            {
                icon: CheckListIcon,
                id: 'claims.show-in-chat',
                keywords: ['claim', 'claims', 'chat', 'show', 'hide', 'transcript'],
                run: () => setShowClaimsInChat(!showClaimsInChat),
                title: showClaimsInChat ? 'Hide claims in chat' : 'Show claims in chat',
            },
        ],
        id: 'claims',
        title: 'Claims',
    };
}
