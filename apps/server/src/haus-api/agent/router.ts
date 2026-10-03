import { createRouter } from '../trpc.ts';
import { agentActiveActivityProcedure } from './active-activity.ts';
import { agentActivityProcedure } from './activity.ts';
import { agentActivityHistoryProcedure } from './activity-history.ts';
import { agentChatsProcedure } from './chats.ts';
import { configureAgentProcedure } from './configure.ts';
import { createAgentProcedure } from './create.ts';
import { deleteAgentProcedure } from './delete.ts';
import { agentDeliveriesProcedure } from './deliveries.ts';
import { agentDeliveryStateProcedure } from './delivery-state.ts';
import { agentExecutionJournalProcedure } from './execution-journal.ts';
import { getAgentProcedure } from './get.ts';
import { importAgentSkillProcedure } from './import-skill.ts';
import { listAgentsProcedure } from './list.ts';
import { onAgentActivityProcedure } from './on-activity.ts';
import { onAgentLifecycleProcedure } from './on-lifecycle.ts';
import { agentPersonalityProcedure } from './personality.ts';
import { resetAgentProcedure } from './reset.ts';
import { restartAgentProcedure } from './restart.ts';
import { agentSessionRotationProcedure } from './session-rotation.ts';
import {
    agentSkillFileProcedure,
    deleteAgentSkillFileProcedure,
    updateAgentSkillFileProcedure,
} from './skill-file.ts';
import { startAgentProcedure } from './start.ts';
import { stopAgentProcedure } from './stop.ts';
import { agentTurnsProcedure } from './turns.ts';
import { updateAgentProfileProcedure } from './update-profile.ts';
import { agentWorkspaceFileProcedure } from './workspace-file.ts';
import { agentWorkspaceFilesProcedure } from './workspace-files.ts';

export const agentRouter = createRouter({
    activity: agentActivityProcedure,
    activityHistory: agentActivityHistoryProcedure,
    activeActivity: agentActiveActivityProcedure,
    chats: agentChatsProcedure,
    configure: configureAgentProcedure,
    create: createAgentProcedure,
    delete: deleteAgentProcedure,
    deliveries: agentDeliveriesProcedure,
    deliveryState: agentDeliveryStateProcedure,
    executionJournal: agentExecutionJournalProcedure,
    get: getAgentProcedure,
    importSkill: importAgentSkillProcedure,
    skillFile: agentSkillFileProcedure,
    deleteSkillFile: deleteAgentSkillFileProcedure,
    list: listAgentsProcedure,
    onLifecycle: onAgentLifecycleProcedure,
    onActivity: onAgentActivityProcedure,
    personality: agentPersonalityProcedure,
    reset: resetAgentProcedure,
    restart: restartAgentProcedure,
    sessionRotation: agentSessionRotationProcedure,
    start: startAgentProcedure,
    stop: stopAgentProcedure,
    turns: agentTurnsProcedure,
    updateProfile: updateAgentProfileProcedure,
    updateSkillFile: updateAgentSkillFileProcedure,
    workspaceFile: agentWorkspaceFileProcedure,
    workspaceFiles: agentWorkspaceFilesProcedure,
});
