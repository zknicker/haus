import type { Agent, Chat, MessageClaim } from '@haus/api';
import { ChannelIconBox } from '../../../components/chats/channel-icon-box.tsx';
import { EntityName } from '../../../components/ui/entity-name.tsx';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useClaimUpdate } from '../../../hooks/servers/use-claim-update.ts';
import { useClaims } from '../../../hooks/servers/use-claims.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import type { HumanDirectory } from '../human-identity.ts';
import { ClaimAssignee } from './claim-assignee.tsx';
import { claimUpdateInput } from './claim-input.ts';
import { claimAssigneeAvatarUrl, claimAssigneeName } from './claim-model.ts';
import { ClaimStatusSelect } from './claim-status-select.tsx';

export function ClaimThreadMetadata({
    chat,
    chatId,
    fallbackClaim,
    messageId,
    serverId,
}: {
    /** The parent chat, shown as a field so its role is explicit. */
    chat?: Chat;
    chatId: string;
    fallbackClaim: MessageClaim;
    messageId: string;
    serverId: string;
}) {
    const agents = useAgents(serverId);
    const humans = useHumanDirectory(serverId);
    const claims = useClaims(serverId, chatId);
    const update = useClaimUpdate();
    const claim =
        claims.data?.claims.find((item) => item.claim.messageId === messageId)?.claim ??
        fallbackClaim;
    const agentDirectory = agents.data ?? [];
    const assigneeLabel = claimAssigneeName(claim, agentDirectory);
    const creator = claimCreatorIdentity(claim, agentDirectory, humans);
    const target = {
        assigneeAgentId: claim.assigneeAgentId,
        assigneeAvatarUrl: claimAssigneeAvatarUrl(claim, agentDirectory),
        assigneeLabel,
        id: messageId,
        number: claim.number,
        status: claim.status,
        version: claim.version,
    };

    return (
        // An outlined group, not a filled one: the composer below already owns
        // the modal's one filled surface, and two slabs at nearly the same
        // value read as two input areas rather than as information + input.
        // The controls are inline for the same reason — boxed fields beside
        // plain facts split the row into two visual kinds at equal width.
        <section
            aria-label={`Claim #${claim.number} details`}
            className="card-shell mb-4 border border-border px-4 py-3"
        >
            <dl className="flex flex-wrap gap-x-8 gap-y-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                    <dt className="text-muted text-sm">Status</dt>
                    <dd className="flex min-h-7 min-w-0 flex-col justify-center gap-1">
                        <ClaimStatusSelect
                            claim={target}
                            error={update.error}
                            isDisabled={update.isPending}
                            onStatusChange={(status) =>
                                update.mutate(claimUpdateInput(serverId, target, { status }))
                            }
                            presentation="inline"
                        />
                    </dd>
                </div>
                <div className="flex min-w-0 max-w-52 flex-col gap-1.5">
                    <dt className="text-muted text-sm">Assignee</dt>
                    <dd className="flex min-h-7 min-w-0 items-center">
                        <ClaimAssignee claim={target} presentation="inline" serverId={serverId} />
                    </dd>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                    <dt className="text-muted text-sm">Created by</dt>
                    <dd className="flex min-h-7 min-w-0 items-center text-sm">
                        <EntityName avatarUrl={creator.avatarUrl} name={creator.name} />
                    </dd>
                </div>
                {chat ? (
                    <div className="flex min-w-0 flex-col gap-1.5">
                        <dt className="text-muted text-sm">Chat</dt>
                        <dd className="flex min-h-7 min-w-0 items-center gap-2 text-sm">
                            <ChatIdentity agents={agentDirectory} chat={chat} />
                        </dd>
                    </div>
                ) : null}
            </dl>
        </section>
    );
}

/**
 * The parent chat, wearing the same mark it wears in the sidebar. Channel
 * colour rides ChannelIconBox's own tokens, so a channel picks one up here the
 * moment the Chat record starts carrying one.
 */
function ChatIdentity({ agents, chat }: { agents: Agent[]; chat: Chat }) {
    if (chat.kind === 'channel') {
        return (
            <>
                <ChannelIconBox size="inline" />
                <span className="min-w-0 truncate">{chat.name ?? 'channel'}</span>
            </>
        );
    }

    const peer = agents.find((agent) => agent.id === chat.peerAgentId);
    return (
        <EntityName
            avatarUrl={peer?.avatarUrl ?? null}
            name={peer?.displayName ?? chat.peerAgentDisplayName ?? 'Direct message'}
            size={18}
        />
    );
}

function claimCreatorIdentity(
    claim: Pick<MessageClaim, 'createdByAgentId' | 'createdByUserId'>,
    agents: Agent[],
    humans: HumanDirectory
) {
    if (claim.createdByAgentId) {
        const agent = agents.find((candidate) => candidate.id === claim.createdByAgentId);
        return {
            avatarUrl: agent?.avatarUrl ?? null,
            name: agent?.displayName ?? `Agent ${claim.createdByAgentId.slice(-6)}`,
        };
    }
    if (claim.createdByUserId) {
        return {
            avatarUrl: humans.avatarUrl(claim.createdByUserId),
            name: humans.name(claim.createdByUserId),
        };
    }
    return { avatarUrl: null, name: 'Unknown' };
}
