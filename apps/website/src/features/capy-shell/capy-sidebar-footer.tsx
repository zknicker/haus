import { Button, Dropdown, Label } from '@heroui/react';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { useMembers } from '../../hooks/servers/use-members.ts';
import { SidebarNavigateProvider } from '../../hooks/shell/sidebar-navigate.tsx';
import { useSignOut } from '../auth/use-sign-out.ts';
import { humanDisplayName } from '../servers/human-identity.ts';
import { HausUpdateFooterContainer } from '../updates/haus-update-footer-container.tsx';
import { useHausUpdate } from '../updates/use-haus-update.ts';
import { CapyFooterSections } from './capy-footer-sections.tsx';

export function CapySidebarFooter({
    onOpenSettings,
    serverId,
    slug,
}: {
    onOpenSettings: () => void;
    serverId: string;
    slug: string;
}) {
    return (
        <SidebarNavigateProvider>
            <div className="flex w-full flex-col gap-2">
                <HausUpdateFooterContainer slug={slug} />
                <div className="flex w-full items-center justify-between gap-1">
                    <AccountMenu onOpenSettings={onOpenSettings} serverId={serverId} />
                    <CapyFooterSections serverId={serverId} slug={slug} />
                </div>
            </div>
        </SidebarNavigateProvider>
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
