import type { AgentSkillFileResult, AgentWorkspaceResult } from '@haus/api';
import type { Deferred } from 'effect';

export type SkillFileValue = NonNullable<AgentSkillFileResult['result']>;
export type WorkspaceValue = NonNullable<AgentWorkspaceResult['result']>;

interface ReplyIdentity {
    agentId: string;
    computerId: string;
    requestId: string;
}

export interface SkillImportReply extends ReplyIdentity {
    deferred: Deferred.Deferred<{ requestId: string; status: 'accepted' }, Error>;
    kind: 'skill-import';
    sourceId: string;
}

export interface SkillFileReply extends ReplyIdentity {
    deferred: Deferred.Deferred<SkillFileValue, Error>;
    kind: 'skill-file';
}

export interface WorkspaceReply extends ReplyIdentity {
    deferred: Deferred.Deferred<WorkspaceValue, Error>;
    kind: 'workspace';
}

export type AgentReply = SkillImportReply | SkillFileReply | WorkspaceReply;
