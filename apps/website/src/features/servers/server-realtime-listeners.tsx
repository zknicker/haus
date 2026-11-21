import * as React from 'react';
import type { RealtimeServer } from '../../hooks/realtime/realtime-server.ts';
import { useAgentContextStream } from '../../hooks/realtime/use-agent-context-stream.ts';
import { useAgentUpdateStream } from '../../hooks/realtime/use-agent-update-stream.ts';
import { useArtifactUpdateStream } from '../../hooks/realtime/use-artifact-update-stream.ts';
import { useChatLifecycleStream } from '../../hooks/realtime/use-chat-lifecycle-stream.ts';
import { useClaimChangeStream } from '../../hooks/realtime/use-claim-change-stream.ts';
import { useCloudAgentSettingsStream } from '../../hooks/realtime/use-cloud-agent-settings-stream.ts';
import { useComputerUpdateStream } from '../../hooks/realtime/use-computer-update-stream.ts';
import { useImageGenerationStream } from '../../hooks/realtime/use-image-generation-stream.ts';
import { useInvitationUpdateStream } from '../../hooks/realtime/use-invitation-update-stream.ts';
import { useMcpUpdateStream } from '../../hooks/realtime/use-mcp-update-stream.ts';
import { useMessageReactionStream } from '../../hooks/realtime/use-message-reaction-stream.ts';
import { useModelConnectionsStream } from '../../hooks/realtime/use-model-connections-stream.ts';
import { useProjectUpdateStream } from '../../hooks/realtime/use-project-update-stream.ts';
import { useReminderStream } from '../../hooks/realtime/use-reminder-stream.ts';
import { useTaskCreatedStream } from '../../hooks/realtime/use-task-created-stream.ts';
import { useTaskFollowStream } from '../../hooks/realtime/use-task-follow-stream.ts';
import { useTaskLabelStream } from '../../hooks/realtime/use-task-label-stream.ts';
import { useTaskUpdatedStream } from '../../hooks/realtime/use-task-updated-stream.ts';
import { useWorkerStream } from '../../hooks/realtime/use-worker-stream.ts';
import { MessageNotifications } from '../notifications/message-notifications.tsx';

/**
 * The active Server's root realtime streams, mounted once per window
 * (specs/realtime-events.md, "Topology"). One tiny component per stream, each
 * owning its subscription and its cache response; nothing here dispatches or
 * maps events. `server.onUpdated` and `member.onUpdated` mount for every
 * accessible Server instead (`ServerEventListeners`), and the Agent lifecycle
 * and activity streams mount with their providers. Memoized: the shell
 * re-renders on every navigation, and none of these streams depend on it.
 */
export const ServerRealtimeListeners = React.memo(function ServerRealtimeListeners({
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
            <ChatLifecycleStream serverId={serverId} />
            <ProjectUpdateStream serverId={serverId} />
            <ClaimChangeStream serverId={serverId} />
            <TaskLabelStream serverId={serverId} />
            <TaskCreatedStream serverId={serverId} />
            <TaskUpdatedStream serverId={serverId} />
            <TaskFollowStream serverId={serverId} />
            <WorkerStream serverId={serverId} />
            <ImageGenerationStream serverId={serverId} />
            <AgentUpdateStream server={server} />
            <AgentContextStream serverId={serverId} />
            <ComputerUpdateStream server={server} />
            <McpUpdateStream serverId={serverId} />
            <ArtifactUpdateStream serverId={serverId} />
            <CloudAgentSettingsStream serverId={serverId} />
            <ModelConnectionsStream serverId={serverId} />
            {canOperate ? <ReminderStream serverId={serverId} /> : null}
            {canOperate ? <InvitationUpdateStream serverId={serverId} /> : null}
        </>
    );
});

interface StreamProps {
    serverId: string;
}

function MessageReactionStream({ serverId }: StreamProps) {
    useMessageReactionStream(serverId);
    return null;
}

function ChatLifecycleStream({ serverId }: StreamProps) {
    useChatLifecycleStream(serverId);
    return null;
}

function ProjectUpdateStream({ serverId }: StreamProps) {
    useProjectUpdateStream(serverId);
    return null;
}

function ClaimChangeStream({ serverId }: StreamProps) {
    useClaimChangeStream(serverId);
    return null;
}

function TaskLabelStream({ serverId }: StreamProps) {
    useTaskLabelStream(serverId);
    return null;
}

function TaskCreatedStream({ serverId }: StreamProps) {
    useTaskCreatedStream(serverId);
    return null;
}

function TaskUpdatedStream({ serverId }: StreamProps) {
    useTaskUpdatedStream(serverId);
    return null;
}

function TaskFollowStream({ serverId }: StreamProps) {
    useTaskFollowStream(serverId);
    return null;
}

function WorkerStream({ serverId }: StreamProps) {
    useWorkerStream(serverId);
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

function AgentContextStream({ serverId }: StreamProps) {
    useAgentContextStream(serverId);
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

function ArtifactUpdateStream({ serverId }: StreamProps) {
    useArtifactUpdateStream(serverId);
    return null;
}

function CloudAgentSettingsStream({ serverId }: StreamProps) {
    useCloudAgentSettingsStream(serverId);
    return null;
}

function ModelConnectionsStream({ serverId }: StreamProps) {
    useModelConnectionsStream(serverId);
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
