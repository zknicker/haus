import { createRouter } from '../trpc.ts';
import { agentActiveActivityProcedure } from './active-activity.ts';
import { agentActivityHistoryProcedure } from './activity-history.ts';
import { agentActivityProcedure } from './activity.ts';
import { agentChatsProcedure } from './chats.ts';
import { configureAgentProcedure } from './configure.ts';
import { agentContextProcedure } from './context.ts';
import { agentConversationStyleProcedure } from './conversation-style.ts';
import { createAgentProcedure } from './create.ts';
import { deleteAgentProcedure } from './delete.ts';
import { agentDeliveriesProcedure } from './deliveries.ts';
import { agentDeliveryStateProcedure } from './delivery-state.ts';
import { agentExecutionJournalProcedure } from './execution-journal.ts';
import { agentExecutionOutlinesProcedure } from './execution-outlines.ts';
import { getAgentProcedure } from './get.ts';
import { importAgentSkillProcedure } from './import-skill.ts';
import { listAgentsProcedure } from './list.ts';
import { onAgentActivityProcedure } from './on-activity.ts';
import { onAgentContextUpdatedProcedure } from './on-context-updated.ts';
import { onAgentExecutionJournalProcedure } from './on-execution-journal.ts';
import { onAgentLifecycleProcedure } from './on-lifecycle.ts';
import { onAgentUpdatedProcedure } from './on-updated.ts';
import { resetAgentProcedure } from './reset.ts';
import { restartAgentProcedure } from './restart.ts';
import { agentRunTriggerProcedure } from './run-trigger.ts';
import { serverTurnsProcedure } from './server-turns.ts';
import { agentSessionRotationProcedure } from './session-rotation.ts';
import { setAgentConnectionAdminProcedure } from './set-connection-admin.ts';
import { setAgentHomeProcedure } from './set-home.ts';
import {
    agentSkillFileProcedure,
    deleteAgentSkillFileProcedure,
    updateAgentSkillFileProcedure,
} from './skill-file.ts';
import { startAgentProcedure } from './start.ts';
import { stopAgentProcedure } from './stop.ts';
import { agentTurnsProcedure } from './turns.ts';
import { updateAgentConversationStyleProcedure } from './update-conversation-style.ts';
import { updateAgentProfileProcedure } from './update-profile.ts';
import { agentWorkspaceFileProcedure } from './workspace-file.ts';
import { agentWorkspaceFilesProcedure } from './workspace-files.ts';

export const agentRouter = createRouter({
    activity: agentActivityProcedure,
    activityHistory: agentActivityHistoryProcedure,
    activeActivity: agentActiveActivityProcedure,
    chats: agentChatsProcedure,
    configure: configureAgentProcedure,
    context: agentContextProcedure,
    conversationStyle: agentConversationStyleProcedure,
    create: createAgentProcedure,
    delete: deleteAgentProcedure,
    deliveries: agentDeliveriesProcedure,
    deliveryState: agentDeliveryStateProcedure,
    executionJournal: agentExecutionJournalProcedure,
    executionOutlines: agentExecutionOutlinesProcedure,
    get: getAgentProcedure,
    importSkill: importAgentSkillProcedure,
    skillFile: agentSkillFileProcedure,
    deleteSkillFile: deleteAgentSkillFileProcedure,
    list: listAgentsProcedure,
    onLifecycle: onAgentLifecycleProcedure,
    onActivity: onAgentActivityProcedure,
    onContextUpdated: onAgentContextUpdatedProcedure,
    onExecutionJournal: onAgentExecutionJournalProcedure,
    onUpdated: onAgentUpdatedProcedure,
    reset: resetAgentProcedure,
    restart: restartAgentProcedure,
    runTrigger: agentRunTriggerProcedure,
    serverTurns: serverTurnsProcedure,
    sessionRotation: agentSessionRotationProcedure,
    setConnectionAdmin: setAgentConnectionAdminProcedure,
    setHome: setAgentHomeProcedure,
    start: startAgentProcedure,
    stop: stopAgentProcedure,
    turns: agentTurnsProcedure,
    updateConversationStyle: updateAgentConversationStyleProcedure,
    updateProfile: updateAgentProfileProcedure,
    updateSkillFile: updateAgentSkillFileProcedure,
    workspaceFile: agentWorkspaceFileProcedure,
    workspaceFiles: agentWorkspaceFilesProcedure,
});
