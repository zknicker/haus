import type { Agent, TriggerKind } from '@haus/api';
import { Switch } from '@heroui/react';
import { GithubIcon, WebhookIcon } from '@hugeicons-pro/core-solid-rounded';
import { AlarmClockIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { useAgentReminders } from '../../../hooks/members/use-agent-reminders.ts';
import { useAgentTriggers } from '../../../hooks/members/use-agent-triggers.ts';
import { useTriggerSetStatus } from '../../../hooks/members/use-trigger-set-status.ts';
import { useViewerTimeZone } from '../../../hooks/members/use-viewer-time-zone.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import {
    resolveReminderDetail,
    scheduledReminders,
} from '../../members/agent-profile/agent-reminder-model.ts';
import {
    formatTriggerActivity,
    resolveTriggerSheetMode,
    type TriggerSheetState,
    triggerRowStatus,
} from '../../members/agent-profile/agent-trigger-model.ts';
import { ReminderHistoryDrawer } from '../../members/agent-profile/reminder-history-drawer.tsx';
import { formatReminderRowSummary } from '../../members/agent-profile/reminder-schedule-presentation.ts';
import { ReminderSheet } from '../../members/agent-profile/reminder-sheet.tsx';
import { TriggerHistoryDrawer } from '../../members/agent-profile/trigger-history-drawer.tsx';
import { TriggerSheet } from '../../members/agent-profile/trigger-sheet.tsx';
import {
    CaptainListEmpty,
    CaptainListGroup,
    CaptainListRow,
    CaptainListRows,
    useCaptainListCollapse,
} from '../captain-list.tsx';

export function CaptainAutomations({
    agent,
    creating,
    history,
    onCreatingChange,
    onHistoryChange,
    server,
}: {
    agent: Agent;
    creating: boolean;
    history: AutomationHistory | null;
    onCreatingChange: (creating: boolean) => void;
    onHistoryChange: (history: AutomationHistory | null) => void;
    server: ServerDetail;
}) {
    const canManage = server.role !== 'member';
    const reminders = useAgentReminders(server.id, agent.id, canManage);
    const triggers = useAgentTriggers(server.id, agent.id, canManage);
    const setStatus = useTriggerSetStatus(server.id, agent.id);
    const viewerZone = useViewerTimeZone(server.id);
    const now = useRelativeNow();
    const reminderGroup = useCaptainListCollapse();
    const triggerGroup = useCaptainListCollapse();
    const [reminderId, setReminderId] = React.useState<string | null>(null);
    const [sheet, setSheet] = React.useState<TriggerSheetState | null>(null);
    const scheduled = scheduledReminders(reminders.data ?? []);
    const triggerRows = triggers.data ?? [];
    const sheetState = creating ? ({ kind: 'create' } as const) : sheet;

    if (!canManage) {
        return <CaptainListEmpty>Only Owners and Admins see automations.</CaptainListEmpty>;
    }
    if (!(reminders.data && triggers.data)) {
        return null;
    }
    const empty = scheduled.length === 0 && triggerRows.length === 0;

    return (
        <div className="flex min-w-0 flex-col gap-3">
            {empty ? (
                <CaptainListEmpty>
                    Nothing scheduled. Tell {agent.displayName} what to remember, or add a Trigger.
                </CaptainListEmpty>
            ) : null}
            {scheduled.length > 0 ? (
                <CaptainListGroup
                    collapse={reminderGroup}
                    count={scheduled.length}
                    title="Reminders"
                >
                    <CaptainListRows label="Reminders" onAction={setReminderId}>
                        {scheduled.map((reminder) => (
                            <CaptainListRow
                                age={null}
                                glyph={<Icon aria-hidden="true" icon={AlarmClockIcon} size={14} />}
                                id={reminder.id}
                                key={reminder.id}
                                note={
                                    formatReminderRowSummary(reminder, { now, viewerZone }).split(
                                        ' · Next run'
                                    )[0]
                                }
                                textValue={reminder.title}
                                title={reminder.title}
                            />
                        ))}
                    </CaptainListRows>
                </CaptainListGroup>
            ) : null}
            {triggerRows.length > 0 ? (
                <CaptainListGroup
                    collapse={triggerGroup}
                    count={triggerRows.length}
                    title="Triggers"
                >
                    <CaptainListRows
                        label="Triggers"
                        onAction={(id) => setSheet({ kind: 'detail', triggerId: id })}
                    >
                        {triggerRows.map((trigger) => (
                            <CaptainListRow
                                age={null}
                                control={
                                    <Switch
                                        aria-label={`${trigger.title} armed`}
                                        isDisabled={setStatus.isPending}
                                        isSelected={trigger.status === 'armed'}
                                        onChange={(selected) =>
                                            setStatus.setStatus(
                                                trigger.id,
                                                selected ? 'armed' : 'disabled'
                                            )
                                        }
                                        size="sm"
                                    >
                                        <Switch.Content>
                                            <Switch.Control>
                                                <Switch.Thumb />
                                            </Switch.Control>
                                        </Switch.Content>
                                    </Switch>
                                }
                                glyph={
                                    <Icon
                                        aria-hidden="true"
                                        icon={triggerKindIcons[trigger.kind]}
                                        size={14}
                                    />
                                }
                                id={trigger.id}
                                key={trigger.id}
                                note={
                                    triggerRowStatus(trigger) ?? formatTriggerActivity(trigger, now)
                                }
                                textValue={trigger.title}
                                title={trigger.title}
                            />
                        ))}
                    </CaptainListRows>
                </CaptainListGroup>
            ) : null}
            <ReminderSheet
                agent={agent}
                onOpenChange={(open) => !open && setReminderId(null)}
                reminder={resolveReminderDetail(reminderId, scheduled)}
                serverId={server.id}
                serverSlug={server.slug}
            />
            <TriggerSheet
                agent={agent}
                mode={resolveTriggerSheetMode(sheetState, triggerRows)}
                onCreated={(created) => {
                    onCreatingChange(false);
                    setSheet({ kind: 'detail', triggerId: created.id });
                }}
                onOpenChange={(open) => {
                    if (!open) {
                        onCreatingChange(false);
                        setSheet(null);
                    }
                }}
                serverId={server.id}
            />
            <ReminderHistoryDrawer
                agentId={agent.id}
                isOpen={history === 'reminders'}
                onOpenChange={(open) => !open && onHistoryChange(null)}
                serverId={server.id}
                serverSlug={server.slug}
            />
            <TriggerHistoryDrawer
                agentId={agent.id}
                isOpen={history === 'triggers'}
                onOpenChange={(open) => !open && onHistoryChange(null)}
                serverId={server.id}
                serverSlug={server.slug}
            />
        </div>
    );
}

export type AutomationHistory = 'reminders' | 'triggers';

const triggerKindIcons = {
    github: GithubIcon,
    webhook: WebhookIcon,
} as const satisfies Record<TriggerKind, unknown>;
