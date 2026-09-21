import { Description, Label, ListBox } from '@heroui/react';
import { InlineSelect } from '@heroui-pro/react';

/** The browser selectors share the same compact control and descriptive menu. */
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
        <InlineSelect
            aria-label={label}
            className="max-w-full"
            disabledKeys={options.filter((option) => option.disabled).map((option) => option.id)}
            isDisabled={isDisabled}
            onChange={(key) => {
                if (typeof key === 'string') {
                    onChange(key);
                }
            }}
            placeholder={`Choose ${label.toLowerCase()}`}
            value={value}
        >
            <InlineSelect.Trigger>
                <InlineSelect.Value />
                <InlineSelect.Indicator />
            </InlineSelect.Trigger>
            <InlineSelect.Popover>
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
            </InlineSelect.Popover>
        </InlineSelect>
    );
}
