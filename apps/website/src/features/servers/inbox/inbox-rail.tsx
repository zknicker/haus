import type { ReactNode } from 'react';
import { activeAgentWindowDays } from './active-agents.ts';
import { inboxLayout } from './inbox-layout.ts';
import { InboxSection } from './inbox-section.tsx';

/**
 * The wide Inbox's right column, which scrolls on its own beside the feed:
 * the Agents meter over Happening now.
 *
 * The rail is the frame alone — two labelled sections — and takes its bodies
 * as slots, so the route can draw it with the Server shell while the section
 * code is still on its way, and the one component that owns the reads fills it
 * once that lands. Labels load with the shell, as every Inbox label does.
 *
 * Agents sits first because it is the alarm: a runaway Agent is the one thing
 * on this side of the page that needs a person before it needs a glance.
 */
export function InboxRail({
    agents,
    happeningNow,
}: {
    agents: ReactNode;
    happeningNow: ReactNode;
}) {
    return (
        <aside aria-label="Agent activity" className={inboxLayout.rail}>
            <InboxSection meta={`Tokens · ${activeAgentWindowDays}d`} title="Agents">
                {agents}
            </InboxSection>
            <InboxSection title="Happening now">{happeningNow}</InboxSection>
        </aside>
    );
}
