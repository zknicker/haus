import type { ServerMemberDirectory } from '@haus/api/membership';
import { Button, Dropdown, Label } from '@heroui/react';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { useSignOut } from '../auth/use-sign-out.ts';
import { humanDisplayName } from '../servers/human-identity.ts';
import { useHausUpdate } from '../updates/use-haus-update.ts';

export function CapyAccountMenu({
    onOpenSettings,
    serverId,
}: {
    onOpenSettings: () => void;
    serverId: string;
}) {
    const signOut = useSignOut();
    return (
        <Dropdown>
            <Button aria-label="Account" isIconOnly size="sm" variant="ghost">
                <ViewerFace serverId={serverId} />
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
                        <VersionItem />
                    </Dropdown.Section>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}

export function ViewerFace({ serverId }: { serverId: string }) {
    const viewer = hausTrpc.member.list.useQuery(
        { serverId },
        { ...queryPolicy.syncedSnapshot, select: selectViewerFace }
    ).data;
    return viewer ? <EntityAvatar name={viewer.name} size={24} src={viewer.avatarUrl} /> : null;
}

function VersionItem() {
    const { view } = useHausUpdate();
    return (
        <Dropdown.Item id="version" textValue={`Haus ${view.version}`}>
            <Label className="tabular-nums">Haus {view.version}</Label>
        </Dropdown.Item>
    );
}

function selectViewerFace(directory: ServerMemberDirectory) {
    const viewer = directory.members.find((member) => member.userId === directory.viewerUserId);
    return viewer ? { avatarUrl: viewer.avatarUrl, name: humanDisplayName(viewer) } : undefined;
}
