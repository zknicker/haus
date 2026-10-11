import { Description, Label, ListBox, Select } from '@heroui/react';
import type { CreatableTriggerKind, TriggerKindOption } from './agent-trigger-model.ts';

/**
 * A Trigger has exactly one kind, so the choice is a single-value Select and
 * never an "add" affordance. It starts unchosen so the step stays a visible
 * part of the walkthrough. A kind that cannot be authored yet stays listed,
 * disabled, with the reason in place of its description.
 */
export function TriggerKindPicker({
    disabledReasons,
    isDisabled,
    kinds,
    onChange,
    value,
}: {
    disabledReasons: Partial<Record<CreatableTriggerKind, string>>;
    isDisabled: boolean;
    kinds: readonly TriggerKindOption[];
    onChange: (kind: CreatableTriggerKind) => void;
    value: CreatableTriggerKind | null;
}) {
    return (
        <Select
            disabledKeys={kinds
                .filter((option) => disabledReasons[option.kind])
                .map((option) => option.kind)}
            fullWidth
            isDisabled={isDisabled}
            isRequired
            onChange={(selected) => {
                // The Select speaks in keys; the closed kind list turns one back
                // into a kind without a cast.
                const option = kinds.find((candidate) => candidate.kind === String(selected));
                if (option) {
                    onChange(option.kind);
                }
            }}
            placeholder="Choose a trigger type"
            value={value}
            variant="secondary"
        >
            <Label>Trigger type</Label>
            <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
                <ListBox>
                    {kinds.map((option) => (
                        <ListBox.Item id={option.kind} key={option.kind} textValue={option.label}>
                            <Label>{option.label}</Label>
                            <Description>
                                {disabledReasons[option.kind] ?? option.description}
                            </Description>
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                    ))}
                </ListBox>
            </Select.Popover>
        </Select>
    );
}
