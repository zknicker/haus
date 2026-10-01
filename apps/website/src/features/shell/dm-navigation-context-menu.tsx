import type { Agent } from '@haus/api';
import { Label } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import {
    ArrowUpRight01Icon,
    CheckListIcon,
    UserCircleIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { useOpenAgentProfile } from '../../hooks/agents/use-open-agent-profile.ts';
import { tasksRoute } from '../servers/server-routes.ts';

export function DmNavigationContextMenu({
    agent,
    chatId,
    chatName,
    children,
    href,
    slug,
}: {
    agent: Agent | null;
    chatId: string | null;
    chatName: string;
    children: React.ReactNode;
    href: string;
    slug: string;
}) {
    const navigate = useNavigate();
    const openAgentProfile = useOpenAgentProfile();
    const onAction = (key: React.Key) => {
        if (key === 'open') {
            navigate(href);
        } else if (key === 'profile' && agent) {
            openAgentProfile(agent.id);
        } else if (key === 'tasks' && chatId) {
            navigate(`${tasksRoute(slug)}?chat=${encodeURIComponent(chatId)}`);
        }
    };

    return (
        <ContextMenu>
            <ContextMenu.Trigger className="flex min-w-0 flex-1 items-center gap-3">
                {children}
            </ContextMenu.Trigger>
            <ContextMenu.Popover>
                <ContextMenu.Menu onAction={onAction}>
                    <ContextMenu.Item id="open" textValue={`Open ${chatName}`}>
                        <Icon aria-hidden="true" icon={ArrowUpRight01Icon} size={16} />
                        <Label>Open chat</Label>
                    </ContextMenu.Item>
                    <ContextMenu.Separator />
                    <ContextMenu.Item
                        id="profile"
                        isDisabled={!agent}
                        textValue="View agent profile"
                    >
                        <Icon aria-hidden="true" icon={UserCircleIcon} size={16} />
                        <Label>View agent profile</Label>
                    </ContextMenu.Item>
                    <ContextMenu.Item id="tasks" isDisabled={!chatId} textValue="View tasks">
                        <Icon aria-hidden="true" icon={CheckListIcon} size={16} />
                        <Label>View tasks</Label>
                    </ContextMenu.Item>
                </ContextMenu.Menu>
            </ContextMenu.Popover>
        </ContextMenu>
    );
}
