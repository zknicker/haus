import { ItemCard } from '@heroui-pro/react';
import { Button, Dropdown, Label, Separator } from '@heroui/react';
import { PlusSignIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Fragment } from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { SettingsRowTitle } from '../settings/layout/settings-row-title.tsx';
import {
    type AccessCaptain,
    type AgentAccessView,
    agentAccessDescription,
    homeCaptainsSummary,
} from './agent-access-model.ts';

export function AgentAccessRows({
    canRevoke,
    isPending,
    onRevoke,
    view,
}: {
    canRevoke: boolean;
    isPending: boolean;
    onRevoke: (agentId: string) => void;
    view: AgentAccessView;
}) {
    return (
        <>
            <ItemCard>
                <ItemCard.Content>
                    <SettingsRowTitle info={agentAccessDescription}>
                        Captain access
                    </SettingsRowTitle>
                    <ItemCard.Description className="whitespace-normal">
                        {homeCaptainsSummary(view.home)}
                    </ItemCard.Description>
                </ItemCard.Content>
            </ItemCard>
            {view.granted.map((captain) => (
                <Fragment key={captain.id}>
                    <Separator />
                    <ItemCard>
                        <ItemCard.Content>
                            <ItemCard.Title>{captain.displayName}</ItemCard.Title>
                            <ItemCard.Description>
                                Allowed by {captain.grantedBy}
                            </ItemCard.Description>
                        </ItemCard.Content>
                        {canRevoke ? (
                            <ItemCard.Action>
                                <Button
                                    aria-label={`Remove ${captain.displayName}`}
                                    isDisabled={isPending}
                                    onPress={() => onRevoke(captain.id)}
                                    size="sm"
                                    variant="secondary"
                                >
                                    Remove
                                </Button>
                            </ItemCard.Action>
                        ) : null}
                    </ItemCard>
                </Fragment>
            ))}
        </>
    );
}

export function CaptainPicker({
    candidates,
    isDisabled,
    onPick,
}: {
    candidates: readonly AccessCaptain[];
    isDisabled: boolean;
    onPick: (agentId: string) => void;
}) {
    return (
        <Dropdown>
            <Button
                aria-label="Add Captain"
                isDisabled={isDisabled || candidates.length === 0}
                isIconOnly
                size="sm"
                variant="ghost"
            >
                <Icon aria-hidden="true" icon={PlusSignIcon} size={16} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu>
                    {candidates.map((captain) => (
                        <Dropdown.Item
                            id={captain.id}
                            key={captain.id}
                            onAction={() => onPick(captain.id)}
                            textValue={captain.displayName}
                        >
                            <Label>{captain.displayName}</Label>
                        </Dropdown.Item>
                    ))}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
