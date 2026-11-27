import { type TaskDeliveryMode, taskDeliveryModes } from '@haus/api';
import { InlineSelect } from '@heroui-pro/react/inline-select';
import { Description, Label, ListBox } from '@heroui/react';

export function TaskDeliverySelect({
    mode,
    onChange,
}: {
    mode: TaskDeliveryMode;
    onChange: (mode: TaskDeliveryMode) => void;
}) {
    return (
        <InlineSelect
            aria-label="Delivery"
            onChange={(next) => {
                const picked = taskDeliveryModes.find((candidate) => candidate === next);
                if (picked) {
                    onChange(picked);
                }
            }}
            value={mode}
        >
            <InlineSelect.Trigger>
                <span className="text-muted text-sm">{deliveryLabels[mode]}</span>
                <InlineSelect.Indicator />
            </InlineSelect.Trigger>
            <InlineSelect.Popover className="w-64" placement="top end">
                <ListBox>
                    {taskDeliveryModes.map((option) => (
                        <ListBox.Item id={option} key={option} textValue={deliveryLabels[option]}>
                            <div className="flex flex-col">
                                <Label>{deliveryLabels[option]}</Label>
                                <Description>{deliveryDescriptions[option]}</Description>
                            </div>
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                    ))}
                </ListBox>
            </InlineSelect.Popover>
        </InlineSelect>
    );
}

const deliveryLabels: Record<TaskDeliveryMode, string> = {
    interrupt: 'Interrupt',
    queue: 'Queue',
    steer: 'Steer',
};

const deliveryDescriptions: Record<TaskDeliveryMode, string> = {
    interrupt: 'Stop the current turn and start with this',
    queue: 'Send after the current turn finishes',
    steer: 'Reach the task at its next step',
};
