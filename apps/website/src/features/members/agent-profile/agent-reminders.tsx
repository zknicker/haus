import type { Agent } from '@haus/api';
import { Button, Separator, Tooltip } from '@heroui/react';
import { Calendar03Icon, HistoryIcon, RepeatIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { useAgentReminders } from '../../../hooks/members/use-agent-reminders.ts';
import { useViewerTimeZone } from '../../../hooks/members/use-viewer-time-zone.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { AgentLoading } from './agent-loading.tsx';
import { resolveReminderDetail, scheduledReminders } from './agent-reminder-model.ts';
import { AutomationRow } from './automation-row.tsx';
import { ProfileListSection } from './profile-list-section.tsx';
import { ReminderHistoryDrawer } from './reminder-history-drawer.tsx';
import { formatReminderRowSummary, reminderKind } from './reminder-schedule-presentation.ts';
import { ReminderSheet } from './reminder-sheet.tsx';

/**
 * The Agent's time-based wakes. Authoring is the Agent's; an operator can open
 * one and cancel it. Each row says which of the two kinds it is — the icon and
 * the line's lead word ("Once" or the cadence) — and nothing else that would
 * make the row wrap.
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
    const [detailId, setDetailId] = React.useState<string | null>(null);
    // One clock for the section, so "Today" turns into "Yesterday" on time.
    const now = useRelativeNow();
    const viewerZone = useViewerTimeZone(server.id);

    const scheduled = scheduledReminders(reminders.data ?? []);
    const detail = resolveReminderDetail(detailId, scheduled);

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
                            <AutomationRow
                                icon={
                                    reminderKind(reminder) === 'once' ? Calendar03Icon : RepeatIcon
                                }
                                kind="reminder"
                                onPress={canView ? () => setDetailId(reminder.id) : undefined}
                                summary={formatReminderRowSummary(reminder, { now, viewerZone })}
                                title={reminder.title}
                            />
                        </React.Fragment>
                    ))
                )}
            </ProfileListSection>
            <ReminderSheet
                agent={agent}
                onOpenChange={(open) => !open && setDetailId(null)}
                reminder={detail}
                serverId={server.id}
                serverSlug={server.slug}
            />
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
