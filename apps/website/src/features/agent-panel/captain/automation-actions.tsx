import { Button, Dropdown, Label, Tooltip } from '@heroui/react';
import { Add01Icon, HistoryIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import type { AutomationHistory } from './captain-automations.tsx';

export function AutomationActions({
    onHistory,
    onNew,
}: {
    onHistory: (history: AutomationHistory) => void;
    onNew: () => void;
}) {
    return (
        <span className="flex shrink-0 items-center gap-1">
            <Dropdown>
                <Tooltip>
                    <Button aria-label="Automation history" isIconOnly size="sm" variant="ghost">
                        <Icon aria-hidden="true" icon={HistoryIcon} size={16} />
                    </Button>
                    <Tooltip.Content>History</Tooltip.Content>
                </Tooltip>
                <Dropdown.Popover placement="bottom end">
                    <Dropdown.Menu
                        aria-label="Automation history"
                        onAction={(key) =>
                            onHistory(historyKinds.find((kind) => kind === key) ?? 'reminders')
                        }
                    >
                        <Dropdown.Item id="reminders" textValue="Reminder history">
                            <Label>Reminder history</Label>
                        </Dropdown.Item>
                        <Dropdown.Item id="triggers" textValue="Trigger history">
                            <Label>Trigger history</Label>
                        </Dropdown.Item>
                    </Dropdown.Menu>
                </Dropdown.Popover>
            </Dropdown>
            <Button aria-label="New Trigger" onPress={onNew} size="sm" variant="tertiary">
                <Icon aria-hidden="true" icon={Add01Icon} size={14} />
                New
            </Button>
        </span>
    );
}

const historyKinds = ['reminders', 'triggers'] as const satisfies readonly AutomationHistory[];
