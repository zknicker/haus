import { ItemCard } from '@heroui-pro/react';
import { Button, Dropdown, Label, Separator } from '@heroui/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Fragment } from 'react';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { SettingsEmptyRow } from '../settings/layout/settings-empty.tsx';
import { SettingsRowTitle } from '../settings/layout/settings-row-title.tsx';
import { SettingsRowError } from '../settings/layout/settings-text.tsx';
import {
    type AccessCaptain,
    type AgentAccessView,
    agentAccessDescription,
    grantedCaptainsEmpty,
} from './agent-access-model.ts';

export function CaptainAccessRows({
    canGrant,
    canRevoke,
    isPending,
    onGrant,
    onRevoke,
    view,
}: {
    canGrant: boolean;
    canRevoke: boolean;
    isPending: boolean;
    onGrant: (agentId: string) => void;
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
                </ItemCard.Content>
                {canGrant ? (
                    <ItemCard.Action>
                        <CaptainPicker
                            candidates={view.candidates}
                            isDisabled={isPending}
                            onPick={onGrant}
                        />
                    </ItemCard.Action>
                ) : null}
            </ItemCard>
            <Separator />
            {view.granted.length === 0 ? (
                <SettingsEmptyRow>{grantedCaptainsEmpty(view.home)}</SettingsEmptyRow>
            ) : (
                view.granted.map((captain, index) => (
                    <Fragment key={captain.id}>
                        {index > 0 ? <Separator /> : null}
                        <GrantedCaptainRow
                            canRevoke={canRevoke}
                            captain={captain}
                            isPending={isPending}
                            onRevoke={onRevoke}
                        />
                    </Fragment>
                ))
            )}
        </>
    );
}

export function CaptainAccessUnresolved({ onRetry }: { onRetry: (() => void) | null }) {
    return (
        <ItemCard>
            <ItemCard.Content>
                <SettingsRowTitle info={agentAccessDescription}>Captain access</SettingsRowTitle>
                {onRetry ? <SettingsRowError>Couldn’t load Captains.</SettingsRowError> : null}
            </ItemCard.Content>
            {onRetry ? (
                <ItemCard.Action>
                    <Button onPress={onRetry} size="sm" variant="secondary">
                        Retry
                    </Button>
                </ItemCard.Action>
            ) : null}
        </ItemCard>
    );
}

function GrantedCaptainRow({
    canRevoke,
    captain,
    isPending,
    onRevoke,
}: {
    canRevoke: boolean;
    captain: AccessCaptain;
    isPending: boolean;
    onRevoke: (agentId: string) => void;
}) {
    return (
        <ItemCard>
            <EntityAvatar name={captain.displayName} size="sm" src={captain.avatarUrl} />
            <ItemCard.Content>
                <ItemCard.Title>{captain.displayName}</ItemCard.Title>
            </ItemCard.Content>
            {canRevoke ? (
                <ItemCard.Action>
                    <Dropdown>
                        <Button
                            aria-label={`${captain.displayName} actions`}
                            isIconOnly
                            size="sm"
                            variant="ghost"
                        >
                            <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
                        </Button>
                        <Dropdown.Popover placement="bottom end">
                            <Dropdown.Menu>
                                <Dropdown.Item
                                    id="remove"
                                    isDisabled={isPending}
                                    onAction={() => onRevoke(captain.id)}
                                    textValue={`Remove ${captain.displayName}`}
                                    variant="danger"
                                >
                                    <Label>Remove</Label>
                                </Dropdown.Item>
                            </Dropdown.Menu>
                        </Dropdown.Popover>
                    </Dropdown>
                </ItemCard.Action>
            ) : null}
        </ItemCard>
    );
}

function CaptainPicker({
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
                size="sm"
                variant="secondary"
            >
                Add
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
                            <EntityAvatar
                                name={captain.displayName}
                                size={20}
                                src={captain.avatarUrl}
                            />
                            <Label>{captain.displayName}</Label>
                        </Dropdown.Item>
                    ))}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
