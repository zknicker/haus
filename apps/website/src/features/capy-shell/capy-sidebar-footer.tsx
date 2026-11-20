import { Button, Dropdown, Label, Tooltip } from '@heroui/react';
import {
    Activity03Icon,
    CheckListIcon,
    Folder01Icon,
    WorkflowSquare10Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import type { IconSvgElement } from '@hugeicons/react';
import { useNavigate } from 'react-router-dom';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { useAgentAppearances } from '../../hooks/members/use-agents.ts';
import { useMembers } from '../../hooks/servers/use-members.ts';
import { useSignOut } from '../auth/use-sign-out.ts';
import { humanDisplayName } from '../servers/human-identity.ts';
import { activityRoute, agentProfileRoute, tasksRoute } from '../servers/server-routes.ts';
import { HausUpdateFooterContainer } from '../updates/haus-update-footer-container.tsx';
import { useHausUpdate } from '../updates/use-haus-update.ts';

export function CapySidebarFooter({
    onOpenSettings,
    serverId,
    slug,
}: {
    onOpenSettings: () => void;
    serverId: string;
    slug: string;
}) {
    const navigate = useNavigate();
    return (
        <div className="flex w-full flex-col gap-2">
            <HausUpdateFooterContainer slug={slug} />
            <div className="flex w-full items-center justify-between gap-1">
                <AccountMenu onOpenSettings={onOpenSettings} serverId={serverId} />
                <nav aria-label="Sections" className="flex items-center">
                    <FooterLink
                        icon={CheckListIcon}
                        label="Tasks"
                        onPress={() => navigate(tasksRoute(slug))}
                    />
                    <FooterLink
                        icon={Folder01Icon}
                        label="Drive"
                        onPress={() => navigate(`/s/${slug}/artifacts`)}
                    />
                    <AutomationsMenu serverId={serverId} slug={slug} />
                    <FooterLink
                        icon={Activity03Icon}
                        label="Activity"
                        onPress={() => navigate(activityRoute(slug))}
                    />
                </nav>
            </div>
        </div>
    );
}

function AccountMenu({
    onOpenSettings,
    serverId,
}: {
    onOpenSettings: () => void;
    serverId: string;
}) {
    const signOut = useSignOut();
    const { view } = useHausUpdate();
    const directory = useMembers(serverId).data;
    const viewer = directory?.members.find((member) => member.userId === directory.viewerUserId);
    const name = viewer ? humanDisplayName(viewer) : 'You';
    return (
        <Dropdown>
            <Button aria-label="Account" isIconOnly size="sm" variant="ghost">
                <EntityAvatar name={name} size={24} src={viewer?.avatarUrl ?? null} />
            </Button>
            <Dropdown.Popover placement="top start">
                <Dropdown.Menu
                    aria-label="Account"
                    disabledKeys={['version']}
                    onAction={(key) => {
                        if (key === 'settings') {
                            onOpenSettings();
                        }
                        if (key === 'sign-out') {
                            signOut();
                        }
                    }}
                >
                    <Dropdown.Section>
                        <Dropdown.Item id="settings" textValue="Settings">
                            <Label>Settings</Label>
                        </Dropdown.Item>
                        <Dropdown.Item id="sign-out" textValue="Sign out">
                            <Label>Sign out</Label>
                        </Dropdown.Item>
                    </Dropdown.Section>
                    <Dropdown.Section>
                        <Dropdown.Item id="version" textValue={`Haus ${view.version}`}>
                            <Label className="tabular-nums">Haus {view.version}</Label>
                        </Dropdown.Item>
                    </Dropdown.Section>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}

function AutomationsMenu({ serverId, slug }: { serverId: string; slug: string }) {
    const navigate = useNavigate();
    const captains = useAgentAppearances(serverId);
    return (
        <Dropdown>
            <Tooltip>
                <Button aria-label="Automations" isIconOnly size="sm" variant="ghost">
                    <Icon aria-hidden="true" className="text-muted" icon={WorkflowSquare10Icon} />
                </Button>
                <Tooltip.Content>Automations</Tooltip.Content>
            </Tooltip>
            <Dropdown.Popover placement="top end">
                <Dropdown.Menu
                    aria-label="Automations"
                    onAction={(key) =>
                        navigate(agentProfileRoute(slug, String(key), 'automations'))
                    }
                >
                    {captains.map((captain) => (
                        <Dropdown.Item
                            id={captain.id}
                            key={captain.id}
                            textValue={captain.displayName}
                        >
                            <EntityAvatar
                                name={captain.displayName}
                                size={20}
                                src={captain.avatarUrl}
                            />
                            <Label>{captain.displayName}</Label>
                        </Dropdown.Item>
                    ))}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}

function FooterLink({
    icon,
    label,
    onPress,
}: {
    icon: IconSvgElement;
    label: string;
    onPress: () => void;
}) {
    return (
        <Tooltip>
            <Button aria-label={label} isIconOnly onPress={onPress} size="sm" variant="ghost">
                <Icon aria-hidden="true" className="text-muted" icon={icon} />
            </Button>
            <Tooltip.Content>{label}</Tooltip.Content>
        </Tooltip>
    );
}
