import type { Agent } from '@haus/api';
import { Separator } from '@heroui/react';
import * as React from 'react';
import { availabilityLabel } from '../computers/presentation.ts';
import { AgentAvatar } from '../members/agent-avatar.tsx';
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
                        className="hover:bg-default/40 focus-visible:ring-focus flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 outline-none focus-visible:ring-2"
                    >
                        <span className="flex min-w-0 items-center gap-2.5">
                            <AgentAvatar agent={agent} size={24} />
                            <span className="text-foreground min-w-0 truncate text-sm font-medium">
                                {agent.displayName}
                            </span>
                            <span className="text-muted truncate text-sm">@{agent.handle}</span>
                        </span>
                        <span className="text-muted shrink-0 text-sm">
                            {availabilityLabel(agent)}
                        </span>
                    </AgentProfileLink>
                </React.Fragment>
            ))}
        </>
    );
}
