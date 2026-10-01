import type { Agent } from '@haus/api';
import { Separator } from '@heroui/react';
import * as React from 'react';
import { AgentAvatar, availabilityLabel } from '../members/agent-avatar.tsx';
import { AgentProfileLink } from '../members/agent-profile-link.tsx';

/**
 * The Agents on one Server, in the Members directory beside the humans. Both
 * are Server participants, so a directory that listed only humans named half
 * its subject; authority is a human membership fact and belongs to the human
 * rows alone.
 *
 * Rows are read-only on purpose. Deletion belongs to the Agent's own Danger
 * section, so the row identifies and links rather than pretending to manage.
 */
export function ServerAgentList({ agents }: { agents: Agent[] }) {
    return (
        <>
            {agents.map((agent, index) => (
                <React.Fragment key={agent.id}>
                    {index > 0 ? <Separator /> : null}
                    <AgentProfileLink
                        agentId={agent.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 outline-none hover:bg-default/40 focus-visible:ring-2 focus-visible:ring-focus"
                    >
                        <span className="flex min-w-0 items-center gap-2.5">
                            <AgentAvatar agent={agent} size={24} />
                            <span className="min-w-0 truncate font-medium text-foreground text-sm">
                                {agent.displayName}
                            </span>
                            <span className="truncate text-muted text-sm">@{agent.handle}</span>
                        </span>
                        <span className="shrink-0 text-muted text-sm">
                            {availabilityLabel(agent.availability)}
                        </span>
                    </AgentProfileLink>
                </React.Fragment>
            ))}
        </>
    );
}
