import type { ServerMember } from '@haus/api/membership';
import { Chip } from '@heroui/react';
import { ShieldUserIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { ProfileFact, ProfileFacts } from '../../../components/ui/profile-facts.tsx';
import { useHumanAvatar } from '../../../hooks/members/use-human-avatar.ts';
import { useHumanIdentity } from '../../../hooks/members/use-human-identity.ts';
import { AvatarPicker } from '../../avatars/avatar-picker.tsx';
import { humanDisplayName, humanHandle } from '../../servers/human-identity.ts';
import { MemberProfileHeader } from '../member-profile-header.tsx';
import { ProfileEdit } from '../profile-edit.tsx';

/** Human-owned identity, edits, and durable workspace facts. */
export function HumanIdentity({
    isSelf,
    member,
    serverId,
}: {
    isSelf: boolean;
    member: ServerMember;
    serverId: string;
}) {
    const [avatarError, setAvatarError] = React.useState<string | null>(null);
    const name = humanDisplayName(member);
    const handle = humanHandle(member);
    const setAvatar = useHumanAvatar(serverId, member.userId);
    const updateProfile = useHumanIdentity(serverId, member.userId);
    const error = avatarError ?? setAvatar.error?.message ?? updateProfile.error?.message ?? null;

    return (
        <MemberProfileHeader
            action={
                isSelf ? (
                    <ProfileEdit
                        description={member.description ?? ''}
                        displayName={member.displayName ?? name}
                        entityLabel="Your profile"
                        isDisabled={updateProfile.isPending}
                        namePlaceholder="Your name"
                        onSave={(draft) => updateProfile.save(draft)}
                    />
                ) : null
            }
            avatar={
                isSelf ? (
                    <AvatarPicker
                        isDisabled={setAvatar.isPending}
                        label="profile photo"
                        name={name}
                        onError={setAvatarError}
                        onSelect={async (image) => {
                            await setAvatar.mutateAsync({
                                bytesBase64: image.base64,
                                mediaType: image.mediaType,
                                serverId,
                                target: { kind: 'user' },
                            });
                        }}
                        size={64}
                        src={member.avatarUrl}
                    />
                ) : (
                    <EntityAvatar name={name} size={64} src={member.avatarUrl} />
                )
            }
            description={member.description}
            name={name}
            subtitle={
                <>
                    {handle ?? member.userId}
                    {isSelf ? ' (you)' : ''}
                </>
            }
        >
            {error ? <p className="mb-3 text-danger text-sm">{error}</p> : null}
            <ProfileFacts>
                <ProfileFact
                    label="Role"
                    value={
                        <Chip
                            color={member.role === 'member' ? 'default' : 'accent'}
                            variant="soft"
                        >
                            <Icon className="size-4 shrink-0" icon={ShieldUserIcon} />
                            <Chip.Label className="capitalize">{member.role}</Chip.Label>
                        </Chip>
                    }
                />
                <ProfileFact label="Email" value={member.email ?? 'Unavailable'} />
                <ProfileFact
                    className="tabular-nums"
                    label="Joined"
                    value={new Date(member.joinedAt).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                    })}
                />
            </ProfileFacts>
        </MemberProfileHeader>
    );
}
