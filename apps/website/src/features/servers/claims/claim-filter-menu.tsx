import { Button, Dropdown, Label } from '@heroui/react';
import type { CheckListIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import type { ClaimFilterField } from './claim-filters.tsx';

/**
 * The add-filter menu: one entry per dimension, each opening its values in a
 * submenu. Dimensions already applied are left out — those are edited through
 * their own pill, so the menu only ever offers what is missing.
 *
 * The trigger stays put once there is nothing left to add, only disabled. A
 * control that disappears from the topbar reads as a bug, not as an answer.
 */
export function ClaimFilterMenu({
    icon,
    label,
    fields,
}: {
    fields: ClaimFilterField[];
    icon: typeof CheckListIcon;
    label: string;
}) {
    const available = fields.filter((field) => field.applied === null && field.options.length > 0);
    if (available.length === 0) {
        // Disabled rather than absent: a control that vanishes from the topbar
        // reads as a bug, not as an answer.
        return (
            <Button aria-label={label} isDisabled isIconOnly size="sm" variant="ghost">
                <Icon aria-hidden="true" icon={icon} size={16} />
            </Button>
        );
    }
    const trigger = (
        <Button aria-label={label} isIconOnly size="sm" variant="ghost">
            <Icon aria-hidden="true" icon={icon} size={16} />
        </Button>
    );

    return (
        <Dropdown>
            {trigger}
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu>
                    {available.map((field) => (
                        <Dropdown.SubmenuTrigger key={field.id}>
                            <Dropdown.Item textValue={field.label}>
                                <Icon
                                    aria-hidden="true"
                                    className="text-muted"
                                    icon={field.icon}
                                    size={16}
                                />
                                <Label>{field.label}</Label>
                                <Dropdown.SubmenuIndicator />
                            </Dropdown.Item>
                            <Dropdown.Popover>
                                <Dropdown.Menu onAction={(key) => field.apply(String(key))}>
                                    {field.options.map((option) => (
                                        <Dropdown.Item
                                            id={option.id}
                                            key={option.id}
                                            textValue={option.label}
                                        >
                                            {option.leading}
                                            <Label>{option.label}</Label>
                                        </Dropdown.Item>
                                    ))}
                                </Dropdown.Menu>
                            </Dropdown.Popover>
                        </Dropdown.SubmenuTrigger>
                    ))}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
