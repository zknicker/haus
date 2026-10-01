import type { ServerMember } from '@haus/api/membership';
import { ProfileFact, ProfileFacts } from '../../../components/ui/profile-facts.tsx';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { PageColumn } from '../../shell/page-column.tsx';
import { MemberProfileHeader } from '../member-profile-header.tsx';
import { CreatedAgents } from './created-agents.tsx';
import { HumanIdentity } from './human-identity.tsx';

/**
 * One human's profile, assembled from independently owned identity and Agent
 * sections. The host owns scrolling and the gutter — both hosts already carry
 * their own — so this composes straight into a `PageColumn`.
 */
export function HumanProfile({
    error,
    member,
    server,
    userId,
    viewerUserId,
}: {
    error?: string;
    member: ServerMember | undefined;
    server: ServerDetail;
    userId: string;
    viewerUserId: string;
}) {
    return (
        <PageColumn>
            {member ? (
                <HumanIdentity
                    isSelf={member.userId === viewerUserId}
                    member={member}
                    serverId={server.id}
                />
            ) : (
                <MemberProfileHeader
                    avatar={<div aria-hidden="true" className="size-16 shrink-0" />}
                    name="Profile"
                >
                    {error ? (
                        <p className="text-danger text-sm" role="alert">
                            {error}
                        </p>
                    ) : null}
                    <div aria-busy={!error}>
                        <ProfileFacts>
                            {['Role', 'Email', 'Joined'].map((label) => (
                                <ProfileFact key={label} label={label} value={null} />
                            ))}
                        </ProfileFacts>
                    </div>
                </MemberProfileHeader>
            )}
            <CreatedAgents serverId={server.id} userId={userId} />
        </PageColumn>
    );
}
