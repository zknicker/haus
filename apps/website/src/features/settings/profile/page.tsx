import type { ServerMember } from '@haus/api/membership';
import { participantHandleSchema, suggestParticipantHandle } from '@haus/api/participant-handle';
import { Button, Input, Separator, TextField } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import * as React from 'react';
import { useHumanAvatar } from '../../../hooks/members/use-human-avatar.ts';
import { useHumanIdentity } from '../../../hooks/members/use-human-identity.ts';
import { useMembers } from '../../../hooks/servers/use-members.ts';
import { isClerkEnabled } from '../../../lib/clerk.tsx';
import { useSignOut } from '../../auth/use-sign-out.ts';
import { AvatarPicker } from '../../avatars/avatar-picker.tsx';
import { humanDisplayName } from '../../servers/human-identity.ts';
import { PageColumn } from '../../shell/page-column.tsx';
import { SettingsPageHeader } from '../layout/settings-page-header.tsx';
import { SettingsRowError } from '../layout/settings-text.tsx';
import { ProfileIdentityPending } from './profile-identity-pending.tsx';

export function ProfileSettings({ serverId }: { serverId: string }) {
    const directory = useMembers(serverId);
    const viewer = directory.data?.members.find(
        (member) => member.userId === directory.data.viewerUserId
    );

    return (
        <PageColumn>
            <SettingsPageHeader
                description="How you appear to the people and Agents you work with."
                title="Profile"
            />
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>Identity</ItemCardGroup.Title>
                </ItemCardGroup.Header>
                {viewer ? (
                    <ProfileIdentity
                        key={`${viewer.userId}:${viewer.displayName ?? ''}`}
                        serverId={serverId}
                        viewer={viewer}
                    />
                ) : (
                    <ProfileIdentityPending
                        error={
                            directory.error?.message ??
                            (directory.data ? 'Your profile is unavailable.' : undefined)
                        }
                    />
                )}
            </ItemCardGroup>
            <AccountSection />
        </PageColumn>
    );
}

function ProfileIdentity({ serverId, viewer }: { serverId: string; viewer: ServerMember }) {
    const [avatarError, setAvatarError] = React.useState<string | null>(null);
    const [displayName, setDisplayName] = React.useState(viewer.displayName ?? '');
    const [handle, setHandle] = React.useState(
        viewer.handle ?? suggestParticipantHandle(viewer.displayName, viewer.email?.split('@')[0])
    );
    const setAvatar = useHumanAvatar(serverId, viewer.userId);
    const updateProfile = useHumanIdentity(serverId, viewer.userId);

    const saveDisplayName = async () => {
        const nextName = displayName.trim();

        if (!nextName || nextName === viewer.displayName) {
            setDisplayName(viewer.displayName ?? '');
            return;
        }

        await updateProfile.save({
            description: viewer.description ?? '',
            displayName: nextName,
        });
    };

    const saveHandle = async () => {
        const parsed = participantHandleSchema.safeParse(handle);
        const nextDisplayName = displayName.trim() || viewer.displayName;

        if (!(parsed.success && nextDisplayName) || parsed.data === viewer.handle) {
            setHandle(viewer.handle ?? '');
            return;
        }

        await updateProfile.save({
            description: viewer.description ?? '',
            displayName: nextDisplayName,
            handle: parsed.data,
        });
    };

    return (
        <ItemCardGroup className="overflow-hidden">
            <ItemCard>
                <ItemCard.Content>
                    <ItemCard.Title>Photo</ItemCard.Title>
                    <ItemCard.Description>Shown beside your messages.</ItemCard.Description>
                    <SettingsRowError>{avatarError ?? setAvatar.error?.message}</SettingsRowError>
                </ItemCard.Content>
                {/* The picker's edit badge overhangs its own box by 8px,
                            so the slot buys that back to keep the row's trailing
                            padding even with every other row. */}
                <ItemCard.Action className="pe-2">
                    <AvatarPicker
                        isDisabled={setAvatar.isPending}
                        label="profile photo"
                        name={humanDisplayName(viewer)}
                        onError={setAvatarError}
                        onSelect={async (image) => {
                            await setAvatar.mutateAsync({
                                bytesBase64: image.base64,
                                mediaType: image.mediaType,
                                serverId,
                                target: { kind: 'user' },
                            });
                        }}
                        src={viewer.avatarUrl}
                    />
                </ItemCard.Action>
            </ItemCard>
            <Separator />
            <ItemCard>
                <ItemCard.Content>
                    <ItemCard.Title>Display Name</ItemCard.Title>
                    <ItemCard.Description>Shown beside your messages.</ItemCard.Description>
                    <SettingsRowError>{updateProfile.error?.message}</SettingsRowError>
                </ItemCard.Content>
                <ItemCard.Action>
                    {/* The field is the row's control, so it carries a
                                readable measure of its own rather than stretching
                                to whatever the trailing slot allows. */}
                    <TextField
                        aria-label="Display name"
                        className="w-56 max-w-full"
                        isDisabled={updateProfile.isPending}
                        isRequired
                        maxLength={80}
                        onBlur={() => {
                            void saveDisplayName().catch(() => undefined);
                        }}
                        onChange={setDisplayName}
                        value={displayName}
                        variant="secondary"
                    >
                        <Input placeholder="Your name" />
                    </TextField>
                </ItemCard.Action>
            </ItemCard>
            <Separator />
            <ItemCard>
                <ItemCard.Content>
                    <ItemCard.Title>Handle</ItemCard.Title>
                    <ItemCard.Description>Your unique @name on this Server.</ItemCard.Description>
                    <SettingsRowError>{updateProfile.error?.message}</SettingsRowError>
                </ItemCard.Content>
                <ItemCard.Action>
                    <TextField
                        aria-label="Handle"
                        className="w-56 max-w-full"
                        isDisabled={updateProfile.isPending}
                        isInvalid={
                            handle.length > 0 && !participantHandleSchema.safeParse(handle).success
                        }
                        isRequired
                        maxLength={31}
                        onBlur={() => {
                            void saveHandle().catch(() => undefined);
                        }}
                        onChange={setHandle}
                        value={handle}
                        variant="secondary"
                    >
                        <Input placeholder="your-handle" />
                    </TextField>
                </ItemCard.Action>
            </ItemCard>
        </ItemCardGroup>
    );
}

/**
 * Ending the session, which the product previously offered nowhere: the only
 * two sign-out calls were a broken-session recovery gate and the Computer
 * pairing screen, neither of which a signed-in reader can reach on purpose.
 */
function AccountSection() {
    // The gate has to come before the hook: `useSignOut` reads Clerk context,
    // and a keyless build (dev, e2e) mounts no ClerkProvider for it to read.
    if (!isClerkEnabled) {
        return null;
    }

    return <SignOutSection />;
}

function SignOutSection() {
    const signOut = useSignOut();

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Account</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                <ItemCard>
                    <ItemCard.Content>
                        <ItemCard.Title>Sign Out</ItemCard.Title>
                        <ItemCard.Description>
                            Ends this session on this device. Your Servers and Agents are
                            unaffected.
                        </ItemCard.Description>
                    </ItemCard.Content>
                    <ItemCard.Action>
                        <Button onPress={signOut} size="sm" variant="secondary">
                            Sign Out
                        </Button>
                    </ItemCard.Action>
                </ItemCard>
            </ItemCardGroup>
        </ItemCardGroup>
    );
}
