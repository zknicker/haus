import { type LinearToolName, linearToolNames } from '@haus/api/linear-actor-meta';
import type { LinearToolEntry } from './tool.ts';
import { getIssue, listComments, searchIssues } from './tools/issue-reads.ts';
import {
    createCommentTool,
    createIssue,
    delegateIssue,
    updateIssue,
} from './tools/issue-writes.ts';
import { uploadImage } from './tools/media.ts';
import { reply, whoami } from './tools/session.ts';
import {
    archiveWorkflowState,
    createWorkflowState,
    updateWorkflowState,
} from './tools/workflow-states.ts';
import {
    getDocument,
    getProject,
    listCycles,
    listLabels,
    listProjects,
    listTeams,
    listUsers,
    listWorkflowStates,
    searchDocuments,
} from './tools/workspace-reads.ts';
import { createDocument, createLabel, createProject } from './tools/workspace-writes.ts';

const entries: readonly LinearToolEntry[] = [
    searchIssues,
    getIssue,
    listComments,
    listTeams,
    listProjects,
    getProject,
    listLabels,
    listUsers,
    listCycles,
    searchDocuments,
    getDocument,
    listWorkflowStates,
    createIssue,
    updateIssue,
    createCommentTool,
    delegateIssue,
    createProject,
    createDocument,
    createLabel,
    createWorkflowState,
    updateWorkflowState,
    archiveWorkflowState,
    uploadImage,
    reply,
    whoami,
];

/** Every Linear tool, in the contract's order (`linearToolNames`). */
export const linearTools: ReadonlyMap<LinearToolName, LinearToolEntry> = new Map(
    entries.map((entry) => [entry.name, entry])
);

if (
    linearTools.size !== linearToolNames.length ||
    linearToolNames.some((name, index) => entries[index]?.name !== name)
) {
    throw new Error('Linear connector tools drifted from the contract.');
}
