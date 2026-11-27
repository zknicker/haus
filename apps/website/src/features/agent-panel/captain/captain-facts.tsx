import { type Agent, agentReasoningEffortLabels } from '@haus/api';
import { ListView } from '@heroui-pro/react';
import { Chip } from '@heroui/react';
import {
    Activity01Icon,
    AlarmClockIcon,
    ArrowRight01Icon,
    Asterisk02Icon,
    ComputerIcon,
    FilterHorizontalIcon,
    Folder01Icon,
    Plug01Icon,
    ShieldUserIcon,
    SparklesIcon,
    UserCircleIcon,
} from '@hugeicons-pro/core-stroke-rounded';
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
import { resolveRuntimeConfig } from '../../members/agent-profile/runtime-model.ts';
import { formatSkillName } from '../../skills/skill-name-format.ts';
import {
    type CaptainDrill,
    canOpenCaptainDrill,
    captainDrillLabels,
} from '../agent-panel-model.ts';
import {
    agentSkillNames,
    countAgentAutomations,
    formatAllSettingsFact,
    formatAutomationsFact,
    formatNameList,
    grantedAgentConnections,
    isUnsetFact,
} from './captain-facts-model.ts';

export interface CaptainFact {
    drill: CaptainDrill;
    status?: { color: React.ComponentProps<typeof Chip>['color']; label: string } | null;
    value: string | undefined;
}

export function CaptainFactRows({
    facts,
    label,
    onOpen,
}: {
    facts: readonly CaptainFact[];
    label: string;
    onOpen: (drill: CaptainDrill) => void;
}) {
    return (
        <ListView
            aria-label={label}
            className="captain-facts captain-facts--panel"
            onAction={(key) => {
                const fact = facts.find((candidate) => candidate.drill === key);
                if (fact) {
                    onOpen(fact.drill);
                }
            }}
            variant="secondary"
        >
            {facts.map((fact) => (
                <ListView.Item
                    id={fact.drill}
                    key={fact.drill}
                    textValue={captainDrillLabels[fact.drill]}
                >
                    <ListView.ItemContent>
                        <span className="captain-list__glyph">
                            <Icon aria-hidden="true" icon={drillIcons[fact.drill]} size={14} />
                        </span>
                        <span className="captain-facts__label">
                            {captainDrillLabels[fact.drill]}
                        </span>
                        <ListView.Title
                            className={
                                isUnsetFact(fact.value) || fact.drill === 'settings'
                                    ? 'captain-facts__value captain-facts__value--unset'
                                    : 'captain-facts__value'
                            }
                        >
                            {fact.value ?? ' '}
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

export function useCaptainFacts(agent: Agent, server: ServerDetail) {
    const canView = server.role !== 'member';
    const computers = useComputers(server.id);
    const connections = useConnections(server.id);
    const reminders = useAgentReminders(server.id, agent.id, canView);
    const triggers = useAgentTriggers(server.id, agent.id, canView);
    const computer = computers.data?.find((candidate) => candidate.id === agent.computerId);
    const inventory = computer?.reportedInventory;
    const execution = resolveRuntimeConfig(agent, inventory?.runtimes ?? []);
    const settled = computers.data !== undefined;
    const skills = agentSkillNames(inventory?.agentSkills, agent.id);
    const automations =
        reminders.data && triggers.data
            ? countAgentAutomations(reminders.data, triggers.data)
            : undefined;
    const standing = canView ? automations : nothingStanding;
    const facts: Record<CaptainDrill, CaptainFact> = {
        activity: { drill: 'activity', value: undefined },
        automations: {
            drill: 'automations',
            value: automations ? formatAutomationsFact(automations) : undefined,
        },
        connections: {
            drill: 'connections',
            value: connections.data
                ? formatNameList(
                      grantedAgentConnections(connections.data, agent.id).map(({ name }) => name)
                  )
                : undefined,
        },
        model: {
            drill: 'model',
            value: settled
                ? execution.model
                    ? `${execution.modelLabel} · ${agentReasoningEffortLabels[agent.desiredReasoningEffort]}`
                    : `${execution.modelLabel} not installed`
                : undefined,
        },
        permissions: { drill: 'permissions', value: 'What it may manage' },
        profile: { drill: 'profile', value: 'Who made it, and when' },
        'runs-on': {
            drill: 'runs-on',
            status: computerException(computer),
            value: settled
                ? computer
                    ? computerLabel(computer)
                    : 'Device unavailable'
                : undefined,
        },
        settings: {
            drill: 'settings',
            value: standing && settled ? formatAllSettingsFact(standing, skills.length) : undefined,
        },
        skills: {
            drill: 'skills',
            value: settled ? formatNameList(skills.map(formatSkillName)) : undefined,
        },
        workspace: { drill: 'workspace', value: 'Files and memory' },
    };
    return {
        facts,
        visible: (drills: readonly CaptainDrill[]) =>
            drills
                .filter((drill) => canOpenCaptainDrill(drill, server.role))
                .map((drill) => facts[drill]),
    };
}

const drillIcons = {
    activity: Activity01Icon,
    automations: AlarmClockIcon,
    connections: Plug01Icon,
    model: Asterisk02Icon,
    permissions: ShieldUserIcon,
    profile: UserCircleIcon,
    'runs-on': ComputerIcon,
    settings: FilterHorizontalIcon,
    skills: SparklesIcon,
    workspace: Folder01Icon,
} satisfies Record<CaptainDrill, unknown>;

const nothingStanding = { armedTriggers: 0, scheduledReminders: 0, total: 0 };

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
