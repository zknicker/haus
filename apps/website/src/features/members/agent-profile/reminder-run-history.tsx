import { Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Fragment } from 'react';
import { useReminderRuns } from '../../../hooks/members/use-reminder-runs.ts';
import { useViewerTimeZone } from '../../../hooks/members/use-viewer-time-zone.ts';
import { SettingsFact } from '../../settings/layout/settings-text.tsx';
import { formatReminderRunDelay, formatReminderTime } from './agent-reminder-model.ts';

/**
 * A recurring Reminder's retained runs, newest first — the Trigger sheet's
 * Fire history in Reminder words. Blank under its title until the Server
 * answers, because "hasn't run yet" is only true once it has.
 */
export function ReminderRunHistory({
    reminderId,
    serverId,
}: {
    reminderId: string;
    serverId: string;
}) {
    const runs = useReminderRuns(serverId, reminderId, true);
    const viewerZone = useViewerTimeZone(serverId);
    // The Server returns oldest first.
    const settled = runs.data ? [...runs.data].reverse() : undefined;

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Run history</ItemCardGroup.Title>
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
                        settled.map((run, index) => {
                            const delay = formatReminderRunDelay(run);
                            return (
                                <Fragment key={run.id}>
                                    {index > 0 ? <Separator /> : null}
                                    <ItemCard>
                                        <ItemCard.Content>
                                            <ItemCard.Title className="tabular-nums">
                                                {formatReminderTime(run.firedAt, viewerZone)}
                                            </ItemCard.Title>
                                        </ItemCard.Content>
                                        {delay ? (
                                            <ItemCard.Action>
                                                <SettingsFact className="tabular-nums">
                                                    {delay}
                                                </SettingsFact>
                                            </ItemCard.Action>
                                        ) : null}
                                    </ItemCard>
                                </Fragment>
                            );
                        })
                    )}
                </ItemCardGroup>
            ) : null}
        </ItemCardGroup>
    );
}
