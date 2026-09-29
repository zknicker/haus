import type { Agent } from '@haus/api';
import { Button, Dropdown, Header, Label, Separator } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import {
    ArrowDown01Icon,
    MoreHorizontalIcon,
    UserCircleIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { agentProfileRoute, tasksRoute } from '../server-routes.ts';
import { ChatContextSurfaceItems, ChatSurfaceItems } from './chat-surface-items.tsx';

export function DmActions({
    compact = false,
    content,
    chatName,
    peerAgent,
    slug,
}: {
    compact?: boolean;
    content: { chatId: string; onOpenFiles: () => void } | null;
    chatName: string;
    peerAgent: Agent | null;
    slug: string;
}) {
    const navigate = useNavigate();
    const runAction = (key: React.Key) => {
        if (key === 'profile' && peerAgent) {
            navigate(agentProfileRoute(slug, peerAgent.id));
            return;
        }
        if (key === 'tasks' && content) {
            navigate(`${tasksRoute(slug)}?chat=${encodeURIComponent(content.chatId)}`);
            return;
        }
        if (key === 'files' && content) {
            content.onOpenFiles();
        }
    };

    return (
        <ContextMenu>
            <ContextMenu.Trigger className="min-w-0">
                <Dropdown>
                    <Button
                        aria-label={`${chatName} — chat actions`}
                        className={compact ? undefined : '-ms-2 min-w-0 gap-2 px-2'}
                        isIconOnly={compact}
                        size="sm"
                        variant="ghost"
                    >
                        {compact ? null : (
                            <>
                                <EntityAvatar
                                    name={peerAgent?.displayName ?? chatName}
                                    size={24}
                                    src={peerAgent?.avatarUrl ?? null}
                                />
                                <span className="truncate font-semibold text-sm">{chatName}</span>
                            </>
                        )}
                        <Icon
                            aria-hidden="true"
                            className="text-muted"
                            icon={compact ? MoreHorizontalIcon : ArrowDown01Icon}
                            size={15}
                        />
                    </Button>
                    <Dropdown.Popover placement="bottom start">
                        <Dropdown.Menu onAction={runAction}>
                            <Dropdown.Section>
                                <Header>Agent</Header>
                                <Dropdown.Item
                                    id="profile"
                                    isDisabled={!peerAgent}
                                    textValue="View agent profile"
                                >
                                    <Icon aria-hidden="true" icon={UserCircleIcon} size={16} />
                                    <Label>View agent profile</Label>
                                </Dropdown.Item>
                            </Dropdown.Section>
                            <Separator />
                            <Dropdown.Section>
                                <Header>Content</Header>
                                <ChatSurfaceItems isDisabled={!content} />
                            </Dropdown.Section>
                        </Dropdown.Menu>
                    </Dropdown.Popover>
                </Dropdown>
            </ContextMenu.Trigger>
            <ContextMenu.Popover>
                <ContextMenu.Menu onAction={runAction}>
                    <ContextMenu.Item
                        id="profile"
                        isDisabled={!peerAgent}
                        textValue="View agent profile"
                    >
                        <Icon aria-hidden="true" icon={UserCircleIcon} size={16} />
                        <Label>View agent profile</Label>
                    </ContextMenu.Item>
                    <ContextMenu.Separator />
                    <ChatContextSurfaceItems isDisabled={!content} />
                </ContextMenu.Menu>
            </ContextMenu.Popover>
        </ContextMenu>
    );
}
