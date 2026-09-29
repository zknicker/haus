import { Button, Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import type { ServerSummary } from '../../../lib/haus-server.tsx';
import { hausTrpc } from '../../../lib/haus-server.tsx';
import { DeleteDialog } from '../../../routes/app/delete-dialog.tsx';
import { PageColumn } from '../../shell/page-column.tsx';
import { SettingsPageHeader } from '../layout/settings-page-header.tsx';
import { SettingsFact, SettingsRowError } from '../layout/settings-text.tsx';

export function ServerSettings({ server }: { server: ServerSummary }) {
    const navigate = useNavigate();
    const utils = hausTrpc.useUtils();
    const [deleting, setDeleting] = React.useState(false);
    const remove = hausTrpc.server.delete.useMutation({
        onSuccess: async () => {
            setDeleting(false);
            await utils.server.list.invalidate();
            navigate('/s', { replace: true });
        },
    });

    return (
        <PageColumn>
            <SettingsPageHeader
                description="Identity and permanent actions for this Server."
                title="Server"
            />
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>Identity</ItemCardGroup.Title>
                </ItemCardGroup.Header>
                <ItemCardGroup className="overflow-hidden">
                    <ItemCard>
                        <ItemCard.Content>
                            <ItemCard.Title>Name</ItemCard.Title>
                        </ItemCard.Content>
                        <ItemCard.Action>
                            <SettingsFact>{server.displayName}</SettingsFact>
                        </ItemCard.Action>
                    </ItemCard>
                    <Separator />
                    <ItemCard>
                        <ItemCard.Content>
                            <ItemCard.Title>Address</ItemCard.Title>
                            <ItemCard.Description>
                                This permanent address identifies your Server and confirms deletion.
                            </ItemCard.Description>
                        </ItemCard.Content>
                        <ItemCard.Action>
                            <SettingsFact>{server.slug}</SettingsFact>
                        </ItemCard.Action>
                    </ItemCard>
                </ItemCardGroup>
            </ItemCardGroup>
            {server.role === 'owner' ? (
                <ItemCardGroup variant="transparent">
                    <ItemCardGroup.Header>
                        <ItemCardGroup.Title>Danger</ItemCardGroup.Title>
                    </ItemCardGroup.Header>
                    <ItemCardGroup className="overflow-hidden">
                        <ItemCard>
                            <ItemCard.Content>
                                <ItemCard.Title>This Server</ItemCard.Title>
                                <ItemCard.Description>
                                    Deletion is permanent and removes all of its data.
                                </ItemCard.Description>
                                <SettingsRowError>{remove.error?.message}</SettingsRowError>
                            </ItemCard.Content>
                            <ItemCard.Action>
                                <Button
                                    onPress={() => setDeleting(true)}
                                    size="sm"
                                    type="button"
                                    variant="danger-soft"
                                >
                                    Delete Server
                                </Button>
                            </ItemCard.Action>
                        </ItemCard>
                    </ItemCardGroup>
                    {deleting ? (
                        <DeleteDialog
                            confirmation={server.slug}
                            description="This immediately disables the Server and permanently deletes its Server data. Offline Computers do not block deletion."
                            onConfirm={() =>
                                remove.mutate({
                                    confirmation: server.slug,
                                    serverId: server.id,
                                })
                            }
                            onOpenChange={(open) => !open && setDeleting(false)}
                            pending={remove.isPending}
                            title="Delete Server"
                        />
                    ) : null}
                </ItemCardGroup>
            ) : null}
        </PageColumn>
    );
}
