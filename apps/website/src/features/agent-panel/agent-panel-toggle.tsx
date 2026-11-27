import { Button, Kbd, Tooltip } from '@heroui/react';
import { SidebarRightIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { toggleAgentPanel, useAgentPanelState } from './agent-panel-store.ts';

export function AgentPanelToggle({ panelKey }: { panelKey: string }) {
    const { open } = useAgentPanelState(panelKey);
    const label = open ? 'Hide panel' : 'Show panel';
    return (
        <Tooltip>
            <Button
                aria-label={label}
                aria-pressed={open}
                isIconOnly
                onPress={() => toggleAgentPanel(panelKey)}
                size="sm"
                variant="ghost"
            >
                <Icon aria-hidden="true" icon={SidebarRightIcon} size={16} />
            </Button>
            <Tooltip.Content>
                {label}
                <Kbd>
                    <Kbd.Abbr keyValue="command" />
                    <Kbd.Content>.</Kbd.Content>
                </Kbd>
            </Tooltip.Content>
        </Tooltip>
    );
}

export function ClosedAgentPanelToggle({ panelKey }: { panelKey: string }) {
    const { open } = useAgentPanelState(panelKey);
    return open ? null : <AgentPanelToggle panelKey={panelKey} />;
}
