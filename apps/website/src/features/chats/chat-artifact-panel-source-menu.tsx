import { Button, Description, Dropdown, Header, Label } from '@heroui/react';
import { FileSearchIcon, PlusSignIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { shellBandIconSize } from '../shell/section-header.tsx';
import type { HausResourceTarget } from './haus-resource-link.ts';

export function ArtifactPanelSourceMenu({
    agentId,
    onOpenTarget,
}: {
    agentId: string;
    onOpenTarget: (target: HausResourceTarget) => void;
}) {
    return (
        <Dropdown>
            <Button aria-label="Open from source" isIconOnly size="sm" variant="ghost">
                <Icon aria-hidden="true" icon={PlusSignIcon} size={shellBandIconSize} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu
                    onAction={(key) => {
                        if (key === 'workspace') {
                            onOpenTarget({ agentId, kind: 'workspaceDirectory', path: '' });
                        }
                    }}
                >
                    <Dropdown.Section>
                        <Header>Open from</Header>
                        <Dropdown.Item id="workspace" isDisabled={!agentId} textValue="Workspace">
                            <Icon icon={FileSearchIcon} size={16} />
                            <div className="flex min-w-0 flex-col">
                                <Label>Workspace</Label>
                                <Description>
                                    {agentId
                                        ? 'Browse files in this agent workspace'
                                        : 'No active agent workspace'}
                                </Description>
                            </div>
                        </Dropdown.Item>
                    </Dropdown.Section>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
