import { Description, type Key, Label, ListBox, Select } from '@heroui/react';
import type { MachineOption } from './machine-model.ts';

export function MachineSelect({
    className,
    isDisabled = false,
    label,
    onSelect,
    options,
    value,
}: {
    className: string;
    isDisabled?: boolean;
    label: string;
    onSelect: (id: string) => void;
    options: readonly MachineOption[];
    value: string | null;
}) {
    return (
        <Select
            aria-label={label}
            className={className}
            isDisabled={isDisabled}
            onChange={(key: Key | null) => {
                if (key !== null && String(key) !== value) {
                    onSelect(String(key));
                }
            }}
            value={value}
            variant="secondary"
        >
            <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
            </Select.Trigger>
            <Select.Popover placement="bottom end">
                <ListBox>
                    {options.map((option) => (
                        <ListBox.Item id={option.id} key={option.id} textValue={option.label}>
                            <div className="flex min-w-0 flex-col">
                                <Label>{option.label}</Label>
                                <Description>{option.online ? 'Online' : 'Offline'}</Description>
                            </div>
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                    ))}
                </ListBox>
            </Select.Popover>
        </Select>
    );
}
