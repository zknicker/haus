import type { TriggerFire } from '@haus/api';
import { Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Fragment } from 'react';
import { useViewerTimeZone } from '../../../hooks/members/use-viewer-time-zone.ts';
import { SettingsFact } from '../../settings/layout/settings-text.tsx';
import { formatTriggerFireDetail, formatTriggerFireTime } from './agent-trigger-model.ts';

/**
 * What has actually reached this Trigger, newest first. An unresolved read
 * keeps the section title and shows nothing under it: "no fires yet" is only
 * true once the Server has answered, and a bordered empty box while the answer
 * is in flight would claim that early.
 */
export function TriggerFireHistory({
    fires,
    isPending,
    serverId,
}: {
    fires: TriggerFire[] | undefined;
    isPending: boolean;
    serverId: string;
}) {
    const viewerZone = useViewerTimeZone(serverId);
    const settled = isPending ? undefined : fires;

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Fire history</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            {settled ? (
                <ItemCardGroup className="max-h-64 overflow-y-auto">
                    {settled.length === 0 ? (
                        <ItemCard>
                            <ItemCard.Content>
                                <ItemCard.Description>
                                    Nothing has fired this trigger yet.
                                </ItemCard.Description>
                            </ItemCard.Content>
                        </ItemCard>
                    ) : (
                        settled.map((fire, index) => (
                            <Fragment key={fire.id}>
                                {index > 0 ? <Separator /> : null}
                                <ItemCard>
                                    <ItemCard.Content>
                                        <ItemCard.Title className="tabular-nums">
                                            {formatTriggerFireTime(fire, viewerZone)}
                                        </ItemCard.Title>
                                    </ItemCard.Content>
                                    <ItemCard.Action className="min-w-0 shrink">
                                        <SettingsFact className="block truncate text-right tabular-nums">
                                            {formatTriggerFireDetail(fire)}
                                        </SettingsFact>
                                    </ItemCard.Action>
                                </ItemCard>
                            </Fragment>
                        ))
                    )}
                </ItemCardGroup>
            ) : null}
        </ItemCardGroup>
    );
}
