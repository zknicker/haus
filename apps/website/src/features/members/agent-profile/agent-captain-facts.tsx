import { type Agent, agentReasoningEffortLabels } from '@haus/api';
import { ListView } from '@heroui-pro/react';
import { Chip } from '@heroui/react';
import { ArrowRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
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
import {
    agentSkillNames,
    countAgentAutomations,
    formatAutomationsFact,
    formatNameList,
    grantedAgentConnections,
    isUnsetFact,
} from './agent-hub-model.ts';
import type { AgentSection } from './agent-sections.ts';
import { resolveRuntimeConfig } from './runtime-model.ts';

interface CaptainFact {
    id: string;
    label: string;
    section: AgentSection;
    status?: { color: React.ComponentProps<typeof Chip>['color']; label: string } | null;
    value: string | undefined;
}

export function AgentCaptainFacts({
    agent,
    onOpen,
    revealed,
    server,
}: {
    agent: Agent;
    onOpen: (section: AgentSection) => void;
    revealed: boolean;
    server: ServerDetail;
}) {
    const facts = useCaptainFacts(agent, revealed, server);
    return (
        <ListView
            aria-label="Setup"
            className="captain-facts"
            onAction={(key) => {
                const fact = facts.find((candidate) => candidate.id === key);
                if (fact) {
                    onOpen(fact.section);
                }
            }}
            variant="secondary"
        >
            {facts.map((fact) => (
                <ListView.Item id={fact.id} key={fact.id} textValue={fact.label}>
                    <ListView.ItemContent>
                        <span className="captain-facts__label">{fact.label}</span>
                        <ListView.Title
                            className={
                                isUnsetFact(fact.value)
                                    ? 'captain-facts__value captain-facts__value--unset'
                                    : 'captain-facts__value'
                            }
                        >
                            {fact.value ?? ' '}
                        </ListView.Title>
                    </ListView.ItemContent>
                    <ListView.ItemAction>
                        {fact.status ? (
                            <Chip color={fact.status.color} size="sm" variant="soft">
                                <Chip.Label>{fact.status.label}</Chip.Label>
                            </Chip>
                        ) : null}
                        <Icon
                            aria-hidden="true"
                            className="text-muted"
                            icon={ArrowRight01Icon}
                            size={14}
                        />
                    </ListView.ItemAction>
                </ListView.Item>
            ))}
        </ListView>
    );
}

function useCaptainFacts(agent: Agent, revealed: boolean, server: ServerDetail) {
    const canView = server.role !== 'member';
    const computers = useComputers(server.id);
    const connections = useConnections(server.id);
    const reminders = useAgentReminders(server.id, agent.id, canView);
    const triggers = useAgentTriggers(server.id, agent.id, canView);
    const computer = computers.data?.find((candidate) => candidate.id === agent.computerId);
    const inventory = computer?.reportedInventory;
    const execution = resolveRuntimeConfig(agent, inventory?.runtimes ?? []);
    const settled = revealed && computers.data !== undefined;
    const facts: CaptainFact[] = [
        {
            id: 'runs-on',
            label: 'Runs on',
            section: 'runtime',
            status: revealed ? computerException(computer) : null,
            value: settled
                ? computer
                    ? computerLabel(computer)
                    : 'Device unavailable'
                : undefined,
        },
        {
            id: 'model',
            label: 'Model',
            section: 'runtime',
            value: settled
                ? execution.model
                    ? `${execution.modelLabel} · ${agentReasoningEffortLabels[agent.desiredReasoningEffort]}`
                    : `${execution.modelLabel} not installed`
                : undefined,
        },
        {
            id: 'automations',
            label: 'Automations',
            section: 'automations',
            value:
                revealed && reminders.data && triggers.data
                    ? formatAutomationsFact(countAgentAutomations(reminders.data, triggers.data))
                    : undefined,
        },
        {
            id: 'skills',
            label: 'Skills',
            section: 'skills',
            value: settled
                ? formatNameList(
                      agentSkillNames(inventory?.agentSkills, agent.id).map(formatSkillName)
                  )
                : undefined,
        },
        {
            id: 'connections',
            label: 'Connections',
            section: 'connections',
            value:
                revealed && connections.data
                    ? formatNameList(
                          grantedAgentConnections(connections.data, agent.id).map(
                              (connection) => connection.name
                          )
                      )
                    : undefined,
        },
        { id: 'workspace', label: 'Workspace', section: 'workspace', value: 'Files and memory' },
    ];
    return facts;
}

function computerException(
    computer: { health: 'degraded' | 'healthy' | 'offline' | 'update-required' } | undefined
) {
    if (!computer || computer.health === 'healthy') {
        return null;
    }
    return {
        color: computerHealthColor(computer.health),
        label: computerHealthLabel(computer.health),
    };
}
