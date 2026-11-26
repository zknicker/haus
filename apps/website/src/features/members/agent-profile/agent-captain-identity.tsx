import type { Agent } from '@haus/api';
import { Button, Chip, Dropdown, Label } from '@heroui/react';
import { MoreHorizontalIcon, UserIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { useAgentAvatar } from '../../../hooks/members/use-agent-avatar.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { AvatarPicker } from '../../avatars/avatar-picker.tsx';
import { availabilityLabel } from '../../computers/presentation.ts';
import { AgentActionsMenu } from './agent-actions-menu.tsx';
import { canRunAgentActions } from './agent-actions-model.ts';
import { AgentAvatarGenerator } from './agent-avatar-generator.tsx';
import { AgentProfileEdit } from './agent-profile-edit.tsx';
import type { AgentSection } from './agent-sections.ts';

const cardAvatarSize = 40;

export function AgentCaptainIdentity({
    agent,
    onDeleted,
    onOpenSection,
    server,
}: {
    agent: Agent;
    onDeleted: () => void;
    onOpenSection: (section: AgentSection) => void;
    server: ServerDetail;
}) {
    const [avatarError, setAvatarError] = React.useState<string | null>(null);
    const [editOpen, setEditOpen] = React.useState(false);
    const menuRef = React.useRef<HTMLButtonElement>(null);
    const setAvatar = useAgentAvatar(server.id, agent.id);
    const canEdit = server.role === 'owner' || server.role === 'admin';
    const error = avatarError ?? setAvatar.error?.message ?? null;

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <div className="flex min-w-0 items-center gap-3">
                <AgentCardAvatar
                    agent={agent}
                    canEdit={canEdit}
                    onError={setAvatarError}
                    server={server}
                    setAvatar={setAvatar}
                />
                <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex min-w-0 items-center gap-2">
                        <h1 className="text-foreground min-w-0 truncate text-lg font-semibold tracking-tight">
                            {agent.displayName}
                        </h1>
                        <AgentPresenceChip agent={agent} />
                    </div>
                    <p className="text-muted min-w-0 truncate text-sm">@{agent.handle}</p>
                </div>
                <span className="-me-2 flex shrink-0">
                    {canRunAgentActions(server.role) ? (
                        <AgentActionsMenu
                            agent={agent}
                            onDeleted={onDeleted}
                            onEditProfile={canEdit ? () => setEditOpen(true) : undefined}
                            onOpenSection={onOpenSection}
                            server={server}
                            triggerRef={menuRef}
                            variant="ghost"
                        />
                    ) : (
                        <AgentProfileMenu
                            agent={agent}
                            onOpenProfile={() => onOpenSection('profile')}
                        />
                    )}
                </span>
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

function AgentCardAvatar({
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
        return (
            <EntityAvatar name={agent.displayName} size={cardAvatarSize} src={agent.avatarUrl} />
        );
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
                size={cardAvatarSize}
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

function AgentProfileMenu({ agent, onOpenProfile }: { agent: Agent; onOpenProfile: () => void }) {
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

function AgentPresenceChip({ agent }: { agent: Agent }) {
    if (agent.availability === 'idle' && !agent.wakePause) {
        return null;
    }
    return (
        <Chip color={agentAvailabilityColor(agent.availability)} size="sm" variant="soft">
            <Chip.Label>{availabilityLabel(agent)}</Chip.Label>
        </Chip>
    );
}

function agentAvailabilityColor(availability: Agent['availability']) {
    switch (availability) {
        case 'working':
            return 'accent' as const;
        case 'idle':
            return 'success' as const;
        case 'error':
            return 'danger' as const;
        default:
            return 'default' as const;
    }
}
