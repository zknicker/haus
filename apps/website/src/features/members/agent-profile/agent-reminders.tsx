import type { Agent } from '@haus/api';
import { Button, Separator, Tooltip } from '@heroui/react';
import { ItemCard } from '@heroui-pro/react';
import { HistoryIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import { useAgentReminders } from '../../../hooks/members/use-agent-reminders.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { AgentLoading } from './agent-loading.tsx';
import { formatReminderSchedule, scheduledReminders } from './agent-reminder-model.ts';
import { ProfileListSection } from './profile-list-section.tsx';
import { ReminderHistoryDrawer } from './reminder-history-drawer.tsx';

/**
 * The Agent's time-based wakes. Read-only: authoring is a CLI verb.
 *
 * "Reminders 3" means three wakes are still coming, so the count and the list
 * are the schedule alone. What has already happened is a log of executions
 * rather than a second list of reminders, and it is the one rare question this
 * section answers, so it rides the header as a single control that opens a
 * drawer.
 */
export function AgentReminders({ agent, server }: { agent: Agent; server: ServerDetail }) {
    const canView = server.role !== 'member';
    const reminders = useAgentReminders(server.id, agent.id, canView);
    const [isHistoryOpen, setHistoryOpen] = React.useState(false);

    const scheduled = scheduledReminders(reminders.data ?? []);

    return (
        <>
            <ProfileListSection
                action={
                    canView ? (
                        <Tooltip delay={0}>
                            <Button
                                aria-label="View reminder history"
                                isIconOnly
                                onPress={() => setHistoryOpen(true)}
                                size="sm"
                                type="button"
                                variant="secondary"
                            >
                                <Icon aria-hidden="true" icon={HistoryIcon} size={16} />
                            </Button>
                            <Tooltip.Content>View reminder history</Tooltip.Content>
                        </Tooltip>
                    ) : null
                }
                count={reminders.data ? scheduled.length : undefined}
                title="Reminders"
            >
                {canView && reminders.isPending ? (
                    <AgentLoading label="Loading reminders" />
                ) : reminders.error && !reminders.data ? (
                    <ProfileListSection.Empty>Unable to load reminders.</ProfileListSection.Empty>
                ) : scheduled.length === 0 ? (
                    <ProfileListSection.Empty>
                        Nothing scheduled. Just tell {agent.displayName} what to remember and when.
                    </ProfileListSection.Empty>
                ) : (
                    scheduled.map((reminder, index) => (
                        <React.Fragment key={reminder.id}>
                            {index > 0 ? <Separator /> : null}
                            <ItemCard>
                                <ItemCard.Content>
                                    <ItemCard.Title>{reminder.title}</ItemCard.Title>
                                    <ItemCard.Description className="tabular-nums">
                                        {formatReminderSchedule(reminder)}
                                    </ItemCard.Description>
                                </ItemCard.Content>
                            </ItemCard>
                        </React.Fragment>
                    ))
                )}
            </ProfileListSection>
            {canView ? (
                <ReminderHistoryDrawer
                    agentId={agent.id}
                    isOpen={isHistoryOpen}
                    onOpenChange={setHistoryOpen}
                    serverId={server.id}
                    serverSlug={server.slug}
                />
            ) : null}
        </>
    );
}
