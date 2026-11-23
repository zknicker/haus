import { type ModelConnection, providerSearchesWeb } from '@haus/api';
import { Button, Dropdown, Label, ProgressBar, Switch } from '@heroui/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../../components/ui/icon.tsx';
import {
    type DisplayPlanWindow,
    percentLeft,
    usageColor,
} from '../../../usage/runtime-plan-windows.ts';
import { SettingsRowError } from '../../layout/settings-text.tsx';
import {
    type ConnectionAction,
    connectionActionLabels,
    connectionActions,
    connectionFailure,
    connectionInfo,
} from './model-connection-model.ts';

export function LeftMeter({ label, window }: { label: string; window: DisplayPlanWindow }) {
    const left = percentLeft(window);
    return (
        <div className="flex w-full min-w-0 items-center gap-2">
            <ProgressBar
                aria-label={`${label} ${window.label} left`}
                className="min-w-8 flex-1"
                color={usageColor(window.usedPercent)}
                size="sm"
                value={left}
            >
                <ProgressBar.Track>
                    <ProgressBar.Fill />
                </ProgressBar.Track>
            </ProgressBar>
            <span className="w-9 shrink-0 text-right text-sm tabular-nums">{left}%</span>
        </div>
    );
}

export function ConnectionDetails({
    connection,
    isOwner,
    isSaving,
    onWebSearch,
}: {
    connection: ModelConnection;
    isOwner: boolean;
    isSaving: boolean;
    onWebSearch: (enabled: boolean) => void;
}) {
    return (
        <div className="flex flex-col items-start gap-2 py-1 whitespace-normal">
            <p className="text-muted text-xs">{connectionInfo(connection)}</p>
            <SettingsRowError>{connectionFailure(connection)}</SettingsRowError>
            {providerSearchesWeb(connection.provider) ? (
                <Switch
                    aria-label={`Web search for ${connection.label}`}
                    isDisabled={!isOwner || isSaving}
                    isSelected={connection.webSearch}
                    onChange={onWebSearch}
                    size="sm"
                >
                    <Switch.Content>
                        <Switch.Control>
                            <Switch.Thumb />
                        </Switch.Control>
                        <Label>Web search</Label>
                    </Switch.Content>
                </Switch>
            ) : null}
        </div>
    );
}

export function ConnectionMenu({
    connection,
    onAction,
}: {
    connection: ModelConnection;
    onAction: (action: ConnectionAction) => void;
}) {
    return (
        <Dropdown>
            <Button aria-label={`${connection.label} actions`} isIconOnly size="sm" variant="ghost">
                <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu>
                    {connectionActions(connection).map((action) => (
                        <Dropdown.Item
                            id={action}
                            key={action}
                            onAction={() => onAction(action)}
                            textValue={connectionActionLabels[action]}
                            variant={action === 'remove' ? 'danger' : undefined}
                        >
                            <Label>{connectionActionLabels[action]}</Label>
                        </Dropdown.Item>
                    ))}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
