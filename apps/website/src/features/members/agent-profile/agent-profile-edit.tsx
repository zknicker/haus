import { AGENT_DESCRIPTION_MAX_LENGTH, type Agent } from '@haus/api';
import {
    useAgentConversationStyle,
    useUpdateAgentConversationStyle,
} from '../../../hooks/members/use-agent-conversation-style.ts';
import { useAgentIdentity } from '../../../hooks/members/use-agent-identity.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { withSavingToast } from '../../../lib/saving-toast.ts';
import {
    type ProfileAgentVoice,
    type ProfileDraft,
    ProfileEdit,
    type ProfileEditAnchor,
} from '../profile-edit.tsx';

export function AgentProfileEdit({
    agent,
    anchor,
    server,
}: {
    agent: Agent;
    anchor: ProfileEditAnchor;
    server: ServerDetail;
}) {
    const updateIdentity = useAgentIdentity(server.id, agent.id);
    const updateVoice = useUpdateAgentConversationStyle(server.id, agent.id);
    const voice = useAgentConversationStyle(server.id, agent.id, true);
    const voiceField: ProfileAgentVoice = voice.data
        ? {
              conversationStyle: voice.data.conversationStyle ?? '',
              signatureEmoji: voice.data.signatureEmoji,
              status: 'ready',
          }
        : { status: 'loading' };
    const saveProfile = (draft: ProfileDraft) => {
        const identityChanged =
            draft.displayName !== agent.displayName ||
            draft.description !== (agent.description ?? '');
        return withSavingToast(() =>
            Promise.all([
                identityChanged ? updateIdentity.save(draft) : null,
                draft.voice ? updateVoice.save(draft.voice) : null,
            ])
        ).then(() => undefined);
    };
    const error = updateIdentity.error?.message ?? updateVoice.error?.message ?? null;

    return (
        <>
            <ProfileEdit
                anchor={anchor}
                description={agent.description ?? ''}
                descriptionInfo="Its role in one or two sentences. Other Captains see it on every message this Captain sends."
                descriptionMaxLength={AGENT_DESCRIPTION_MAX_LENGTH}
                displayName={agent.displayName}
                entityLabel="Captain profile"
                isDisabled={updateIdentity.isPending || updateVoice.isPending}
                namePlaceholder="Captain name"
                onSave={saveProfile}
                voice={voiceField}
            />
            {error ? <p className="text-danger text-sm">{error}</p> : null}
        </>
    );
}
