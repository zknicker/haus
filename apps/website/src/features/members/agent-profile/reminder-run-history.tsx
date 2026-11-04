import { Chip, Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Fragment } from 'react';
import { useReminderRuns } from '../../../hooks/members/use-reminder-runs.ts';
import { useViewerTimeZone } from '../../../hooks/members/use-viewer-time-zone.ts';
import { SettingsFact } from '../../settings/layout/settings-text.tsx';
import {
    formatReminderRunDelay,
    formatReminderRunDetail,
    formatReminderRunSummaryLine,
    formatReminderTime,
    type ReminderRunLike,
    reminderOutcomeBadge,
} from './agent-reminder-model.ts';

type ReminderRun = ReminderRunLike & { firedAt: string; id: string; scheduledFor: string };

/** One run: when it fired, and — for a script reminder — its outcome, duration, and exit code. */
function ReminderRunRow({
    hasScript,
    run,
    viewerZone,
}: {
    hasScript: boolean;
    run: ReminderRun;
    viewerZone: string;
}) {
    const delay = formatReminderRunDelay(run);
    const detail = hasScript ? formatReminderRunDetail(run) : null;
    const badge = hasScript ? reminderOutcomeBadge(run.outcome) : null;

    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title className="tabular-nums">
                    {formatReminderTime(run.firedAt, viewerZone)}
                </ItemCard.Title>
                {detail ? (
                    <ItemCard.Description className="tabular-nums">{detail}</ItemCard.Description>
                ) : null}
            </ItemCard.Content>
            <ItemCard.Action className="flex items-center gap-2">
                {delay ? <SettingsFact className="tabular-nums">{delay}</SettingsFact> : null}
                {badge ? (
                    <Chip color={badge.color} size="sm" variant="soft">
                        {badge.label}
                    </Chip>
                ) : null}
            </ItemCard.Action>
        </ItemCard>
    );
}

/**
 * A recurring Reminder's retained runs, newest first — the Trigger sheet's
 * Fire history in Reminder words. Blank under its title until the Server
 * answers, because "hasn't run yet" is only true once it has.
 *
 * `hasScript` gates the wake-rule facts (outcome chip, duration, exit code,
 * and the summary line): a script-less reminder always wakes, so none of
 * that says anything its schedule doesn't already.
 */
export function ReminderRunHistory({
    hasScript,
    reminderId,
    serverId,
}: {
    hasScript: boolean;
    reminderId: string;
    serverId: string;
}) {
    const runs = useReminderRuns(serverId, reminderId, true);
    const viewerZone = useViewerTimeZone(serverId);
    // The Server returns oldest first.
    const settled = runs.data ? [...runs.data].reverse() : undefined;
    const summaryLine = hasScript && settled ? formatReminderRunSummaryLine(settled) : null;

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Run history</ItemCardGroup.Title>
                {summaryLine ? (
                    <ItemCardGroup.Description>{summaryLine}</ItemCardGroup.Description>
                ) : null}
            </ItemCardGroup.Header>
            {runs.error && !runs.data ? (
                <ItemCardGroup>
                    <ItemCard>
                        <ItemCard.Content>
                            <ItemCard.Description>Unable to load run history.</ItemCard.Description>
                        </ItemCard.Content>
                    </ItemCard>
                </ItemCardGroup>
            ) : settled ? (
                <ItemCardGroup className="max-h-64 overflow-y-auto">
                    {settled.length === 0 ? (
                        <ItemCard>
                            <ItemCard.Content>
                                <ItemCard.Description>
                                    This reminder hasn't run yet.
                                </ItemCard.Description>
                            </ItemCard.Content>
                        </ItemCard>
                    ) : (
                        settled.map((run, index) => (
                            <Fragment key={run.id}>
                                {index > 0 ? <Separator /> : null}
                                <ReminderRunRow
                                    hasScript={hasScript}
                                    run={run}
                                    viewerZone={viewerZone}
                                />
                            </Fragment>
                        ))
                    )}
                </ItemCardGroup>
            ) : null}
        </ItemCardGroup>
    );
}
