import { Description, Label, ListBox, Select } from '@heroui/react';

/**
 * The browser selectors: the settings row's compact field Select, at the
 * width the group's facts share (`browserControlWidth`), with a descriptive menu.
 */
export function BrowserChoice({
    label,
    value,
    options,
    onChange,
    isDisabled,
}: {
    label: string;
    value: string | null;
    options: { id: string; label: string; description?: string; disabled?: boolean }[];
    onChange: (value: string) => void;
    isDisabled: boolean;
}) {
    return (
        <Select
            aria-label={label}
            className={browserControlWidth}
            disabledKeys={options.filter((option) => option.disabled).map((option) => option.id)}
            isDisabled={isDisabled}
            onChange={(key) => {
                if (typeof key === 'string') {
                    onChange(key);
                }
            }}
            placeholder={`Choose ${label.toLowerCase()}`}
            value={value}
            variant="secondary"
        >
            <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
                <ListBox items={options}>
                    {(option) => (
                        <ListBox.Item id={option.id} textValue={option.label}>
                            <div className="flex flex-col">
                                <Label>{option.label}</Label>
                                {option.description ? (
                                    <Description>{option.description}</Description>
                                ) : null}
                            </div>
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                    )}
                </ListBox>
            </Select.Popover>
        </Select>
    );
}

/** One width for every control and fact in the Browser group. */
export const browserControlWidth = 'w-64 max-w-full';
