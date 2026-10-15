import { useLinearIssueStream } from '../../hooks/linear/use-linear-issue-stream.ts';
import { useLinearUpdateStream } from '../../hooks/linear/use-linear-update-stream.ts';
import type { RealtimeServer } from '../../hooks/realtime/realtime-server.ts';
import { useAgentUpdateStream } from '../../hooks/realtime/use-agent-update-stream.ts';
import { useChatLifecycleStream } from '../../hooks/realtime/use-chat-lifecycle-stream.ts';
import { useCloudAgentSettingsStream } from '../../hooks/realtime/use-cloud-agent-settings-stream.ts';
import { useCloudAgentWorkStream } from '../../hooks/realtime/use-cloud-agent-work-stream.ts';
import { useComputerUpdateStream } from '../../hooks/realtime/use-computer-update-stream.ts';
import { useImageGenerationStream } from '../../hooks/realtime/use-image-generation-stream.ts';
import { useInvitationUpdateStream } from '../../hooks/realtime/use-invitation-update-stream.ts';
import { useMcpUpdateStream } from '../../hooks/realtime/use-mcp-update-stream.ts';
import { useMessageReactionStream } from '../../hooks/realtime/use-message-reaction-stream.ts';
import { useReminderStream } from '../../hooks/realtime/use-reminder-stream.ts';
import { useTaskChangeStream } from '../../hooks/realtime/use-task-change-stream.ts';
import { useTaskLabelStream } from '../../hooks/realtime/use-task-label-stream.ts';
import { useThreadFollowStream } from '../../hooks/realtime/use-thread-follow-stream.ts';
import { MessageNotifications } from '../notifications/message-notifications.tsx';

/**
 * The active Server's root realtime streams, mounted once per window
 * (specs/realtime-events.md, "Topology"). One tiny component per stream, each
 * owning its subscription and its cache response; nothing here dispatches or
 * maps events. `server.onUpdated` and `member.onUpdated` mount for every
 * accessible Server instead (`ServerEventListeners`), and the Agent lifecycle
 * and activity streams mount with their providers.
 */
export function ServerRealtimeListeners({
    server,
}: {
    server: RealtimeServer & { role: 'admin' | 'member' | 'owner' };
}) {
    const canOperate = server.role === 'owner' || server.role === 'admin';
    const serverId = server.id;
    return (
        <>
            <MessageNotifications key={serverId} server={server} />
            <MessageReactionStream serverId={serverId} />
            <ThreadFollowStream serverId={serverId} />
            <ChatLifecycleStream serverId={serverId} />
            <TaskChangeStream serverId={serverId} />
            <TaskLabelStream serverId={serverId} />
            <CloudAgentWorkStream serverId={serverId} />
            <ImageGenerationStream serverId={serverId} />
            <AgentUpdateStream server={server} />
            <ComputerUpdateStream server={server} />
            <McpUpdateStream serverId={serverId} />
            <LinearUpdateStream serverId={serverId} />
            <LinearIssueStream serverId={serverId} />
            <CloudAgentSettingsStream serverId={serverId} />
            {canOperate ? <ReminderStream serverId={serverId} /> : null}
            {canOperate ? <InvitationUpdateStream serverId={serverId} /> : null}
        </>
    );
}

interface StreamProps {
    serverId: string;
}

function MessageReactionStream({ serverId }: StreamProps) {
    useMessageReactionStream(serverId);
    return null;
}

function ThreadFollowStream({ serverId }: StreamProps) {
    useThreadFollowStream(serverId);
    return null;
}

function ChatLifecycleStream({ serverId }: StreamProps) {
    useChatLifecycleStream(serverId);
    return null;
}

function TaskChangeStream({ serverId }: StreamProps) {
    useTaskChangeStream(serverId);
    return null;
}

function TaskLabelStream({ serverId }: StreamProps) {
    useTaskLabelStream(serverId);
    return null;
}

function CloudAgentWorkStream({ serverId }: StreamProps) {
    useCloudAgentWorkStream(serverId);
    return null;
}

function ImageGenerationStream({ serverId }: StreamProps) {
    useImageGenerationStream(serverId);
    return null;
}

function AgentUpdateStream({ server }: { server: RealtimeServer }) {
    useAgentUpdateStream(server);
    return null;
}

function ComputerUpdateStream({ server }: { server: RealtimeServer }) {
    useComputerUpdateStream(server);
    return null;
}

function McpUpdateStream({ serverId }: StreamProps) {
    useMcpUpdateStream(serverId);
    return null;
}

function LinearUpdateStream({ serverId }: StreamProps) {
    useLinearUpdateStream(serverId);
    return null;
}

function LinearIssueStream({ serverId }: StreamProps) {
    useLinearIssueStream(serverId);
    return null;
}

function CloudAgentSettingsStream({ serverId }: StreamProps) {
    useCloudAgentSettingsStream(serverId);
    return null;
}

function ReminderStream({ serverId }: StreamProps) {
    useReminderStream(serverId);
    return null;
}

function InvitationUpdateStream({ serverId }: StreamProps) {
    useInvitationUpdateStream(serverId);
    return null;
}
