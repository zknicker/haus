import type { ServerMember } from '@haus/api/membership';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { PageColumn } from '../../shell/page-column.tsx';
import {
    MemberProfileFact,
    MemberProfileFacts,
    MemberProfileHeader,
} from '../member-profile-header.tsx';
import { CreatedAgents } from './created-agents.tsx';
import { HumanIdentity } from './human-identity.tsx';

/**
 * One human's profile, assembled from independently owned identity and Agent
 * sections. The host owns scrolling and the gutter — both hosts already carry
 * their own — so this composes straight into a `PageColumn`.
 */
export function HumanProfile({
    agentHref,
    error,
    member,
    server,
    userId,
    viewerUserId,
}: {
    /**
     * Where an Agent row goes. This profile has two hosts — the members browser
     * and Settings — and a row must stay inside the one the reader is in, so the
     * destination belongs to the host rather than to the list.
     */
    agentHref: (agentId: string) => string;
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
                        <MemberProfileFacts>
                            {['Role', 'Email', 'Joined'].map((label) => (
                                <MemberProfileFact key={label} label={label} value={null} />
                            ))}
                        </MemberProfileFacts>
                    </div>
                </MemberProfileHeader>
            )}
            <CreatedAgents agentHref={agentHref} serverId={server.id} userId={userId} />
        </PageColumn>
    );
}
