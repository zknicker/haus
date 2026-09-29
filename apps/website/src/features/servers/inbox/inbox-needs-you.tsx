import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { useNeedsYou } from '../../../hooks/servers/use-needs-you.ts';
import { useNeedsYouDone } from '../../../hooks/servers/use-needs-you-done.ts';
import { useServerContext } from '../server-context.ts';
import { InboxSection, InboxSectionPending } from './inbox-section.tsx';
import { NeedsYouList } from './needs-you-list.tsx';
import { needsYouConversationPath, toNeedsYouRowView } from './needs-you-rows.ts';

/**
 * Conversations addressed to this human that they have not answered
 * (ADR 0037): DM messages from others, and @mentions of them or inline replies
 * to their messages in Channels and Threads. An Agent asks a person exactly this way; there is no separate
 * question record. A row clears when the viewer replies where the addresser
 * will see it, or presses Done, and comes back on newer addressing.
 *
 * Stalled claims are not here: they are Agent work and read on the Tasks
 * page, in "Stopped before finishing".
 */
export function InboxNeedsYou() {
    const { server } = useServerContext();
    const navigate = useNavigate();
    const needsYou = useNeedsYou(server.id);
    const done = useNeedsYouDone();
    const humans = useHumanDirectory(server.id);
    const agents = useAgents(server.id);
    const agentById = React.useMemo(
        () => new Map((agents.data ?? []).map((agent) => [agent.id, agent])),
        [agents.data]
    );
    const rows = React.useMemo(
        () =>
            (needsYou.data ?? []).map((row) =>
                toNeedsYouRowView(row, { agents: agents.data ?? [], humans })
            ),
        [agents.data, humans, needsYou.data]
    );

    return (
        <InboxSection title="Needs you">
            {needsYou.data ? (
                <NeedsYouList
                    agentById={agentById}
                    onDone={(view) =>
                        done.mutate({
                            chatId: view.row.chatId,
                            serverId: server.id,
                            throughSequence: view.row.latest.sequence,
                        })
                    }
                    onOpenRow={(view) => navigate(needsYouConversationPath(server.slug, view.row))}
                    rows={rows}
                />
            ) : (
                <InboxSectionPending label="Loading what needs you" />
            )}
        </InboxSection>
    );
}
