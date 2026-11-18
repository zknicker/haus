import { formatSkillReferenceTarget, type MentionOption } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useSkillReferenceDescription({
    chatId,
    enabled,
    serverId,
    skillId,
}: {
    chatId: string;
    enabled: boolean;
    serverId: string;
    skillId: string;
}) {
    const options = hausTrpc.chat.mentionOptions.useQuery(
        {
            agentIds: [],
            chatId,
            serverId,
        },
        {
            ...queryPolicy.syncedSnapshot,
            enabled,
        }
    );

    return selectSkillReferenceDescription(options.data?.options ?? [], skillId);
}

export function selectSkillReferenceDescription(
    options: readonly MentionOption[],
    skillId: string
) {
    const target = formatSkillReferenceTarget(skillId);
    const description = options.find((option) => option.id === target)?.description?.trim();
    return description || null;
}
