import { Button, Popover } from '@heroui/react';
import * as React from 'react';
import { cn } from '../../../lib/utils.ts';
import { LabelDot } from '../label-chip.tsx';
import {
    type TaskLabelColor,
    taskLabelColorNames,
    taskLabelColors,
    taskLabelDotClass,
} from '../label-colors.ts';

/**
 * A small popover of the nine palette swatches. The trigger shows the current
 * color; picking one closes the popover.
 */
export function LabelSwatchPicker({
    color,
    disabled = false,
    onChange,
}: {
    color: TaskLabelColor;
    disabled?: boolean;
    onChange: (color: TaskLabelColor) => void;
}) {
    const [open, setOpen] = React.useState(false);

    return (
        <Popover isOpen={open} onOpenChange={setOpen}>
            <Button
                aria-label={`Color: ${taskLabelColorNames[color]}`}
                isDisabled={disabled}
                isIconOnly
                size="sm"
                variant="ghost"
            >
                <LabelDot color={color} />
            </Button>
            <Popover.Content>
                <Popover.Dialog>
                    <div className="grid grid-cols-3 gap-1">
                        {taskLabelColors.map((option) => (
                            <Button
                                aria-label={taskLabelColorNames[option]}
                                isIconOnly
                                key={option}
                                onPress={() => {
                                    onChange(option);
                                    setOpen(false);
                                }}
                                size="sm"
                                variant={option === color ? 'secondary' : 'ghost'}
                            >
                                <span
                                    className={cn(
                                        'size-3.5 rounded-full',
                                        taskLabelDotClass[option]
                                    )}
                                />
                            </Button>
                        ))}
                    </div>
                </Popover.Dialog>
            </Popover.Content>
        </Popover>
    );
}
