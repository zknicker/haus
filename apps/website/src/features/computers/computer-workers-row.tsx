import { ItemCard } from '@heroui-pro/react';
import { Label, ListBox, Select, Switch } from '@heroui/react';
import { useSetComputerWorkers } from '../../hooks/computer-workers/use-set-computer-workers.ts';
import { withSaveErrorToast } from '../../lib/saving-toast.ts';
import { SettingsRowTitle } from '../settings/layout/settings-row-title.tsx';
import {
    workerLimitOptions,
    workersDescription,
    workersSwitchEnabled,
} from './computer-workers-model.ts';

interface WorkerSettings {
    canChangeWorkers: boolean;
    canEnableWorkers: boolean;
    id: string;
    workerLimit: number;
    workersEnabled: boolean;
}

export function ComputerWorkersRow({
    computer,
    serverId,
}: {
    computer: WorkerSettings;
    serverId: string;
}) {
    const setWorkers = useSetComputerWorkers(serverId);
    const save = (enabled: boolean, limit?: number) => {
        withSaveErrorToast(() =>
            setWorkers.mutateAsync({ computerId: computer.id, enabled, limit, serverId })
        ).catch(() => undefined);
    };

    return (
        <ItemCard>
            <ItemCard.Content>
                <SettingsRowTitle info={workersDescription}>Workers can run here</SettingsRowTitle>
            </ItemCard.Content>
            <ItemCard.Action>
                <div className="flex items-center gap-3">
                    {computer.workersEnabled ? (
                        <Select
                            aria-label="Worker limit"
                            isDisabled={!computer.canChangeWorkers || setWorkers.isPending}
                            onChange={(value) => save(true, Number(value))}
                            value={String(computer.workerLimit)}
                            variant="secondary"
                        >
                            <Select.Trigger>
                                <Select.Value />
                                <Select.Indicator />
                            </Select.Trigger>
                            <Select.Popover>
                                <ListBox>
                                    {workerLimitOptions(computer.workerLimit).map((limit) => (
                                        <ListBox.Item
                                            id={String(limit)}
                                            key={limit}
                                            textValue={`Up to ${limit}`}
                                        >
                                            <Label>Up to {limit}</Label>
                                            <ListBox.ItemIndicator />
                                        </ListBox.Item>
                                    ))}
                                </ListBox>
                            </Select.Popover>
                        </Select>
                    ) : null}
                    <Switch
                        aria-label="Workers can run here"
                        isDisabled={!workersSwitchEnabled(computer) || setWorkers.isPending}
                        isSelected={computer.workersEnabled}
                        onChange={(next) => save(next)}
                    >
                        <Switch.Content>
                            <Switch.Control>
                                <Switch.Thumb />
                            </Switch.Control>
                        </Switch.Content>
                    </Switch>
                </div>
            </ItemCard.Action>
        </ItemCard>
    );
}
