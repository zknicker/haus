import type { ChatMessage } from './chat.ts';
import type { ActiveCloudAgentWorkLocation } from './cloud-agent.ts';
import { work } from './cloud-agent-fixture.ts';
import {
    type CloudAgentWork,
    cloudAgentTitleMaxLength,
    cloudAgentWorkSchema,
} from './cloud-agent-shared.ts';
import { formatCloudAgentWorkLink } from './cloud-agent-work-link.ts';

/**
 * Shared Cloud Agent work link fixtures (ADR 0044). Server, App, and Computer
 * slices build against these so every surface agrees on one link shape.
 */
export const linkedWork: CloudAgentWork = cloudAgentWorkSchema.parse(work);

/**
 * Title → written label → parsed label. The migration's SQL mirror of
 * `formatCloudAgentWorkLink` must produce `label` for each `title`.
 */
export const cloudAgentWorkLinkLabelCases = [
    { title: 'Fix the flaky delivery test', label: 'Fix the flaky delivery test' },
    { title: 'Close ] the bracket]', label: 'Close  the bracket' },
    { title: 'Line one\r\nLine two\nthree', label: 'Line one Line two three' },
    { title: 'C:\\path\\to', label: 'C:\\\\path\\\\to' },
    { title: 'Open [draft', label: 'Open \\[draft' },
    { title: 'trailing\\', label: 'trailing\\\\' },
    { title: 'Café 修正 🚀 ✓', label: 'Café 修正 🚀 ✓' },
    { title: ']]]', label: 'Cloud Agent work' },
    { title: ' \r\n ', label: 'Cloud Agent work' },
    { title: 'x'.repeat(cloudAgentTitleMaxLength), label: 'x'.repeat(cloudAgentTitleMaxLength) },
    {
        title: '\\'.repeat(cloudAgentTitleMaxLength),
        label: '\\\\'.repeat(cloudAgentTitleMaxLength),
    },
] as const;

export const linkedWorkLink = formatCloudAgentWorkLink(linkedWork.title, linkedWork.id);

/** A `text` launch Message after ADR 0044: authored words, then the trusted link. */
export const linkedMessage: ChatMessage = {
    attachments: [],
    author: { agentId: linkedWork.agentId, kind: 'agent' },
    body: { kind: 'text' },
    chatId: linkedWork.chatId,
    cloudAgentWork: [linkedWork],
    content: `On it, sending this to a Cloud Agent.\n\n${linkedWorkLink}`,
    createdAt: linkedWork.createdAt,
    id: linkedWork.messageId,
    imageGenerations: [],
    nonce: 'nonce_cloud_agent_launch',
    reactions: [],
    reply: null,
    runId: 'run_launch',
    sequence: 7,
    serverId: 'srv_studio',
    sessionGeneration: 1,
};

/** Both arms of "Happening now"'s `location`. */
export const activeWorkLocations = {
    message: {
        chatId: 'cht_tech_ops',
        kind: 'message',
        messageId: 'msg_linking_elsewhere',
        threadChatId: null,
    },
    workThread: {
        anchorMessageId: linkedWork.messageId,
        kind: 'work-thread',
        threadChatId: 'cht_work_thread',
    },
} as const satisfies Record<string, ActiveCloudAgentWorkLocation>;
