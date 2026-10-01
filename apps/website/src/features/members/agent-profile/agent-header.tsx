import type { Agent } from '@haus/api';
import { Chip } from '@heroui/react';
import * as React from 'react';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { useAgentAvatar } from '../../../hooks/members/use-agent-avatar.ts';
import { useAgentIdentity } from '../../../hooks/members/use-agent-identity.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { AvatarPicker } from '../../avatars/avatar-picker.tsx';
import { availabilityLabel } from '../../computers/presentation.ts';
import { MemberProfileHeader } from '../member-profile-header.tsx';
import { ProfileEdit } from '../profile-edit.tsx';
import { AgentActionsMenu } from './agent-actions-menu.tsx';
import { canRunAgentActions } from './agent-actions-model.ts';
import { AgentAvatarGenerator } from './agent-avatar-generator.tsx';

const headerAvatarSize = 64;

/**
 * The Agent's identity at the top of its hub: the mark, the name
 * with its role and current presence, and one muted line of handle and
 * description. The far end carries the two things a reader acts on here —
 * editing the profile, and the lifecycle verbs behind one overflow menu.
 *
 * Created date is deliberately absent: it is a provenance fact, not an identity one,
 * and it lives in the Profile section. Model, runtime, and Computer are absent
 * for the same reason — the Runs on card and its section own them. Nothing
 * else names this Agent on its page, so the name is the page's `h1`.
 */
export function AgentHeader({
    agent,
    onDeleted,
    server,
}: {
    agent: Agent;
    onDeleted: () => void;
    server: ServerDetail;
}) {
    const [avatarError, setAvatarError] = React.useState<string | null>(null);
    const [generateOpen, setGenerateOpen] = React.useState(false);
    const setAvatar = useAgentAvatar(server.id, agent.id);
    const updateIdentity = useAgentIdentity(server.id, agent.id);
    const error = avatarError ?? setAvatar.error?.message ?? updateIdentity.error?.message ?? null;
    const canEdit = server.role === 'owner' || server.role === 'admin';
    // Factory Agents (Cove) carry a product-owned identity the Server refuses
    // to change, so no editor rather than a guaranteed error. Profile says why.
    const canEditIdentity = canEdit && agent.factoryKind === 'ordinary';
    // The menu always offers Generate for an ordinary Agent; without the
    // Server capability the item renders disabled with the reason inline.
    const canGenerate = canEditIdentity;

    return (
        <MemberProfileHeader
            action={
                <div className="flex items-center gap-2">
                    {canEditIdentity ? (
                        <ProfileEdit
                            description={agent.description ?? ''}
                            displayName={agent.displayName}
                            entityLabel="Agent profile"
                            isDisabled={updateIdentity.isPending}
                            namePlaceholder="Agent name"
                            onSave={(draft) => updateIdentity.save(draft)}
                        />
                    ) : null}
                    {canRunAgentActions(server.role) ? (
                        <AgentActionsMenu agent={agent} onDeleted={onDeleted} server={server} />
                    ) : null}
                </div>
            }
            avatar={
                canEdit ? (
                    <>
                        <AvatarPicker
                            generateUnavailableReason={
                                server.avatarGenerationAvailable
                                    ? undefined
                                    : 'Not configured on this Server.'
                            }
                            isDisabled={setAvatar.isPending}
                            label="Agent photo"
                            name={agent.displayName}
                            onError={setAvatarError}
                            onGenerate={canGenerate ? () => setGenerateOpen(true) : undefined}
                            onSelect={async (image) => {
                                await setAvatar.mutateAsync({
                                    bytesBase64: image.base64,
                                    mediaType: image.mediaType,
                                    serverId: server.id,
                                    target: { agentId: agent.id, kind: 'agent' },
                                });
                            }}
                            size={headerAvatarSize}
                            src={agent.avatarUrl}
                        />
                        {canGenerate && server.avatarGenerationAvailable ? (
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
                ) : (
                    <EntityAvatar
                        name={agent.displayName}
                        size={headerAvatarSize}
                        src={agent.avatarUrl}
                    />
                )
            }
            badges={
                <Chip color={agentAvailabilityColor(agent.availability)} size="sm" variant="soft">
                    <Chip.Label>{availabilityLabel(agent.availability)}</Chip.Label>
                </Chip>
            }
            description={agent.description}
            name={agent.displayName}
            subtitle={`@${agent.handle}`}
        >
            {error ? <p className="text-danger text-sm">{error}</p> : null}
        </MemberProfileHeader>
    );
}

/** Presence as a status color: only a working Agent is newsworthy in accent. */
export function agentAvailabilityColor(availability: Agent['availability']) {
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
