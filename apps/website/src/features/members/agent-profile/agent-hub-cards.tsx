import type { Agent } from '@haus/api';
import { ItemCardGroup } from '@heroui-pro/react';
import {
    AiMagicIcon,
    AlarmClockIcon,
    ComputerIcon,
    Folder01Icon,
    Plug01Icon,
    UserIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import { useAgentReminders } from '../../../hooks/members/use-agent-reminders.ts';
import { useAgentTriggers } from '../../../hooks/members/use-agent-triggers.ts';
import { useComputers } from '../../../hooks/servers/use-computers.ts';
import { useConnections } from '../../../hooks/servers/use-connections.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import {
    computerHealthColor,
    computerHealthLabel,
    computerLabel,
} from '../../computers/presentation.ts';
import { formatSkillName } from '../../skills/skill-name-format.ts';
import { AgentHubCard } from './agent-hub-card.tsx';
import {
    agentSkillNames,
    countAgentAutomations,
    formatAutomationsFact,
    formatNameList,
    grantedAgentConnections,
} from './agent-hub-model.ts';
import { formatAgentProfileFact, useAgentCreatorName } from './agent-profile-card.tsx';
import type { AgentSection } from './agent-sections.ts';
import { resolveRuntimeConfig } from './runtime-model.ts';

/**
 * The hub's six doorways, one per drill-down section, each stating the fact it
 * holds rather than defining itself. The grid follows its own container — three
 * columns in a wide tab, two in a mid one, one in a side pane — because the
 * same page renders full-width on web and 420px wide in the desktop side pane.
 */
export function AgentHubCards({
    agent,
    onOpen,
    revealed,
    server,
}: {
    agent: Agent;
    onOpen: (section: AgentSection) => void;
    /** The hub's one reveal: facts stay blank until the hub's reads land together. */
    revealed: boolean;
    server: ServerDetail;
}) {
    const canView = server.role !== 'member';
    const computers = useComputers(server.id);
    const connections = useConnections(server.id);
    const reminders = useAgentReminders(server.id, agent.id, canView);
    const triggers = useAgentTriggers(server.id, agent.id, canView);
    const computer = computers.data?.find((candidate) => candidate.id === agent.computerId);
    const inventory = computer?.reportedInventory;
    const execution = resolveRuntimeConfig(agent, inventory?.runtimes ?? []);
    const settled = revealed && computers.data !== undefined;
    const creator = useAgentCreatorName(agent);

    return (
        <ItemCardGroup
            // The column count is the component's own variable; only its
            // breakpoints move to the container (Tailwind container queries).
            className="@[40rem]:[--item-card-group-columns:2] @[60rem]:[--item-card-group-columns:3] [--item-card-group-columns:1]"
            layout="grid"
        >
            <AgentHubCard
                fact={
                    settled
                        ? `${computer ? computerLabel(computer) : 'Computer unavailable'} · ${
                              execution.model
                                  ? execution.modelLabel
                                  : `${execution.modelLabel} not installed`
                          }`
                        : undefined
                }
                icon={ComputerIcon}
                onPress={() => onOpen('runtime')}
                status={
                    revealed && computer
                        ? {
                              color: computerHealthColor(computer.health),
                              label: computerHealthLabel(computer.health),
                          }
                        : null
                }
                title="Runs on"
            />
            <AgentHubCard
                fact={revealed ? formatAgentProfileFact(agent, creator) : undefined}
                icon={UserIcon}
                onPress={() => onOpen('profile')}
                title="Profile"
            />
            <AgentHubCard
                fact={
                    revealed && reminders.data && triggers.data
                        ? formatAutomationsFact(
                              countAgentAutomations(reminders.data, triggers.data)
                          )
                        : undefined
                }
                icon={AlarmClockIcon}
                onPress={() => onOpen('automations')}
                title="Automations"
            />
            <AgentHubCard
                fact={
                    settled
                        ? formatNameList(
                              agentSkillNames(inventory?.agentSkills, agent.id).map(formatSkillName)
                          )
                        : undefined
                }
                icon={AiMagicIcon}
                onPress={() => onOpen('skills')}
                title="Skills"
            />
            <AgentHubCard
                fact={
                    revealed && connections.data
                        ? formatNameList(
                              grantedAgentConnections(connections.data, agent.id).map(
                                  (connection) => connection.name
                              )
                          )
                        : undefined
                }
                icon={Plug01Icon}
                onPress={() => onOpen('connections')}
                title="Connections"
            />
            <AgentHubCard
                fact="Files and memory"
                icon={Folder01Icon}
                onPress={() => onOpen('workspace')}
                title="Workspace"
            />
        </ItemCardGroup>
    );
}
