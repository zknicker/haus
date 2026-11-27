import type { Agent } from '@haus/api';
import { Button, Dropdown, Label } from '@heroui/react';
import { MoreHorizontalIcon, UserIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { useAgentAvatar } from '../../../hooks/members/use-agent-avatar.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { AvatarPicker } from '../../avatars/avatar-picker.tsx';
import { AgentActionsMenu } from '../../members/agent-profile/agent-actions-menu.tsx';
import { canRunAgentActions } from '../../members/agent-profile/agent-actions-model.ts';
import { AgentAvatarGenerator } from '../../members/agent-profile/agent-avatar-generator.tsx';
import { AgentProfileEdit } from '../../members/agent-profile/agent-profile-edit.tsx';
import { serverRoute } from '../../servers/server-routes.ts';

const avatarSize = 32;

export function CaptainHeader({
    agent,
    onOpenProfile,
    server,
}: {
    agent: Agent;
    onOpenProfile: () => void;
    server: ServerDetail;
}) {
    const navigate = useNavigate();
    const [avatarError, setAvatarError] = React.useState<string | null>(null);
    const [editOpen, setEditOpen] = React.useState(false);
    const menuRef = React.useRef<HTMLButtonElement>(null);
    const setAvatar = useAgentAvatar(server.id, agent.id);
    const canEdit = server.role === 'owner' || server.role === 'admin';
    const error = avatarError ?? setAvatar.error?.message ?? null;

    return (
        <div className="flex min-w-0 flex-col gap-2 px-2">
            <div className="flex min-w-0 items-center gap-2.5">
                <CaptainAvatar
                    agent={agent}
                    canEdit={canEdit}
                    onError={setAvatarError}
                    server={server}
                    setAvatar={setAvatar}
                />
                <h2 className="flex min-w-0 flex-1 items-baseline gap-1.5">
                    <span className="text-foreground truncate font-semibold">
                        {agent.displayName}
                    </span>
                    <span className="text-muted truncate text-sm font-normal">@{agent.handle}</span>
                </h2>
                {canRunAgentActions(server.role) ? (
                    <AgentActionsMenu
                        agent={agent}
                        onDeleted={() => navigate(serverRoute(server.slug), { replace: true })}
                        onEditProfile={canEdit ? () => setEditOpen(true) : undefined}
                        onOpenProfile={onOpenProfile}
                        server={server}
                        triggerRef={menuRef}
                        variant="ghost"
                    />
                ) : (
                    <CaptainProfileMenu agent={agent} onOpenProfile={onOpenProfile} />
                )}
            </div>
            {canEdit ? (
                <AgentProfileEdit
                    agent={agent}
                    anchor={{ isOpen: editOpen, onOpenChange: setEditOpen, triggerRef: menuRef }}
                    server={server}
                />
            ) : null}
            {error ? <p className="text-danger text-sm">{error}</p> : null}
        </div>
    );
}

function CaptainAvatar({
    agent,
    canEdit,
    onError,
    server,
    setAvatar,
}: {
    agent: Agent;
    canEdit: boolean;
    onError: (message: string | null) => void;
    server: ServerDetail;
    setAvatar: ReturnType<typeof useAgentAvatar>;
}) {
    const [generateOpen, setGenerateOpen] = React.useState(false);
    if (!canEdit) {
        return <EntityAvatar name={agent.displayName} size={avatarSize} src={agent.avatarUrl} />;
    }
    return (
        <>
            <AvatarPicker
                generateUnavailableReason={
                    server.avatarGenerationAvailable ? undefined : 'Not configured on this Server.'
                }
                isDisabled={setAvatar.isPending}
                isFlush
                label="Captain photo"
                name={agent.displayName}
                onError={onError}
                onGenerate={() => setGenerateOpen(true)}
                onSelect={async (image) => {
                    await setAvatar.mutateAsync({
                        bytesBase64: image.base64,
                        mediaType: image.mediaType,
                        serverId: server.id,
                        target: { agentId: agent.id, kind: 'agent' },
                    });
                }}
                size={avatarSize}
                src={agent.avatarUrl}
            />
            {server.avatarGenerationAvailable ? (
                <AgentAvatarGenerator
                    agentId={agent.id}
                    currentAvatarUrl={agent.avatarUrl}
                    key={agent.id}
                    name={agent.displayName}
                    onOpenChange={setGenerateOpen}
                    open={generateOpen}
                    serverId={server.id}
                />
            ) : null}
        </>
    );
}

function CaptainProfileMenu({ agent, onOpenProfile }: { agent: Agent; onOpenProfile: () => void }) {
    return (
        <Dropdown>
            <Button
                aria-label={`${agent.displayName} — Captain actions`}
                isIconOnly
                size="sm"
                variant="ghost"
            >
                <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu aria-label="Captain actions">
                    <Dropdown.Item id="profile" onAction={onOpenProfile} textValue="Profile">
                        <Icon aria-hidden="true" icon={UserIcon} size={16} />
                        <Label>Profile</Label>
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
