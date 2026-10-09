import { agentRouter } from './agent/router.ts';
import { attachmentRouter } from './attachment/router.ts';
import { automationRouter } from './automation/router.ts';
import { avatarRouter } from './avatar/router.ts';
import { browserRouter } from './browser/router.ts';
import { chatRouter } from './chat/router.ts';
import { cloudAgentProviderRouter } from './cloud-agent-provider/router.ts';
import { cloudAgentSettingsRouter } from './cloud-agent-settings/router.ts';
import { cloudAgentWorkRouter } from './cloud-agent-work/router.ts';
import { computerRouter } from './computer/router.ts';
import { devRouter } from './dev/router.ts';
import { invitationRouter } from './invitation/router.ts';
import { mcpRouter } from './mcp/router.ts';
import { memberRouter } from './member/router.ts';
import { pushRouter } from './push/router.ts';
import { reminderRouter } from './reminder/router.ts';
import { serverRouter } from './server/router.ts';
import { sessionRouter } from './session/router.ts';
import { statsRouter } from './stats/router.ts';
import { taskRouter } from './task/router.ts';
import { taskLabelRouter } from './task-label/router.ts';
import { threadRouter } from './thread/router.ts';
import { triggerRouter } from './trigger/router.ts';
import { createRouter } from './trpc.ts';

/**
 * The whole Haus Server contract.
 */
export const hausRouter = createRouter({
    agent: agentRouter,
    attachment: attachmentRouter,
    automation: automationRouter,
    avatar: avatarRouter,
    browser: browserRouter,
    chat: chatRouter,
    cloudAgentProvider: cloudAgentProviderRouter,
    cloudAgentSettings: cloudAgentSettingsRouter,
    cloudAgentWork: cloudAgentWorkRouter,
    computer: computerRouter,
    dev: devRouter,
    invitation: invitationRouter,
    member: memberRouter,
    mcp: mcpRouter,
    push: pushRouter,
    reminder: reminderRouter,
    server: serverRouter,
    session: sessionRouter,
    stats: statsRouter,
    task: taskRouter,
    taskLabel: taskLabelRouter,
    thread: threadRouter,
    trigger: triggerRouter,
});

export type HausRouter = typeof hausRouter;
