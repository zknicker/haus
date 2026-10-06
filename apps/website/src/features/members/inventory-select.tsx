import { Description, Label, ListBox, Select } from '@heroui/react';

export function InventorySelect({
    description,
    disabled = false,
    label,
    onChange,
    options,
    placeholder,
    value,
}: {
    description?: string;
    disabled?: boolean;
    label: string;
    onChange: (value: string) => void;
    options: ReadonlyArray<{ description?: string; id: string; label: string }>;
    placeholder: string;
    value: string;
}) {
    return (
        <Select
            fullWidth
            isDisabled={disabled}
            onChange={(next) => onChange(next ? String(next) : '')}
            placeholder={placeholder}
            value={value}
            variant="secondary"
        >
            <Label>{label}</Label>
            <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
                <ListBox>
                    {options.map((option) => (
                        <ListBox.Item id={option.id} key={option.id} textValue={option.label}>
                            <Label>{option.label}</Label>
                            {option.description ? (
                                <Description>{option.description}</Description>
                            ) : null}
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                    ))}
                </ListBox>
            </Select.Popover>
            {description ? <Description>{description}</Description> : null}
        </Select>
    );
}
