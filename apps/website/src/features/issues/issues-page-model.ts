import type { Issue, IssueState } from '@haus/api';
import type { IssueListFilters } from '../../hooks/issues/use-issue-list.ts';
import { issueActorFromKey, unassignedKey } from './issue-actor.ts';
import { issueListStateOrder, issueStateOrder } from './issue-state.ts';

export const issueViews = [
    { id: 'for-you', label: 'For you' },
    { id: 'assigned', label: 'Assigned to me' },
    { id: 'created', label: 'Created by me' },
    { id: 'mentioned', label: 'Mentioned' },
    { id: 'all', label: 'All' },
] as const;

export type IssueView = (typeof issueViews)[number]['id'];
export type IssueLayout = 'board' | 'list';

export interface IssuesPageFilters {
    assignee: null | string;
    label: null | string;
    layout: IssueLayout;
    project: null | string;
    view: IssueView;
}

export const issueFilterNames = ['assignee', 'label', 'project'] as const;

export function readIssuesPageFilters(params: URLSearchParams) {
    const view = params.get('view');
    return {
        assignee: params.get('assignee'),
        label: params.get('label'),
        layout: params.get('layout') === 'board' ? 'board' : 'list',
        project: params.get('project'),
        view: issueViews.some((entry) => entry.id === view) ? (view as IssueView) : 'for-you',
    } satisfies IssuesPageFilters;
}

export function isFiltered(filters: IssuesPageFilters) {
    return issueFilterNames.some((name) => filters[name] !== null);
}

export function issueListInput(filters: IssuesPageFilters, viewerUserId: string) {
    const input: IssueListFilters = viewInput(filters, viewerUserId);
    return input;
}

function viewInput(filters: IssuesPageFilters, viewerUserId: string) {
    const viewer = { kind: 'user' as const, userId: viewerUserId };
    const scoped = {
        ...(filters.project ? { projectId: filters.project } : {}),
        ...assigneeFilter(filters),
    };
    switch (filters.view) {
        case 'for-you':
            return { ...scoped, reader: 'subscribed' as const };
        case 'assigned':
            return { ...scoped, assignee: viewer };
        case 'created':
            return { ...scoped, creator: viewer };
        case 'mentioned':
            return { ...scoped, reader: 'mentioned' as const };
        case 'all':
            return scoped;
    }
}

export function filterIssues(issues: readonly Issue[], filters: Pick<IssuesPageFilters, 'label'>) {
    const { label } = filters;
    return label ? issues.filter((issue) => issue.labelIds.includes(label)) : [...issues];
}

export interface IssueStateGroup {
    issues: Issue[];
    state: IssueState;
}

export function groupIssuesByState(issues: readonly Issue[]) {
    return issueListStateOrder
        .map((state) => stateGroup(issues, state))
        .filter((group) => group.issues.length > 0);
}

export function issueBoardColumns(issues: readonly Issue[]) {
    return issueStateOrder.map((state) => stateGroup(issues, state));
}

function stateGroup(issues: readonly Issue[], state: IssueState) {
    const group: IssueStateGroup = {
        issues: issues.filter((issue) => issue.state.id === state),
        state,
    };
    return group;
}

function assigneeFilter(filters: IssuesPageFilters) {
    const actor =
        filters.view === 'assigned' || filters.assignee === null
            ? null
            : filters.assignee === unassignedKey
              ? ('none' as const)
              : issueActorFromKey(filters.assignee);
    return actor ? { assignee: actor } : {};
}
