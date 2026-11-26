import { EmptyState } from '@heroui-pro/react';
import { Tabs } from '@heroui/react';
import { Alert02Icon, TaskDone01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { useIssueList } from '../../hooks/issues/use-issue-list.ts';
import { useMembers } from '../../hooks/servers/use-members.ts';
import { useServerContext } from '../servers/server-context.ts';
import { PageColumn } from '../shell/page-column.tsx';
import { IssueBoard } from './issue-board.tsx';
import { ClearFiltersButton, useSetSearchParam } from './issue-filter-select.tsx';
import { IssueList } from './issue-list.tsx';
import {
    filterIssues,
    isFiltered,
    issueFilterNames,
    issueListInput,
    type IssuesPageFilters,
    issueViews,
    readIssuesPageFilters,
} from './issues-page-model.ts';
import { IssuesToolbar } from './issues-toolbar.tsx';

export { IssuesBandControls } from './issues-band-controls.tsx';

export function IssuesPage() {
    const { server } = useServerContext();
    const [params] = useSearchParams();
    const filters = readIssuesPageFilters(params);
    const viewerUserId = useMembers(server.id).data?.viewerUserId ?? null;
    return (
        <div className="min-h-0 flex-1 overflow-y-auto">
            <PageColumn className="@container max-w-none gap-2 px-3 pt-1">
                <IssueViewTabs view={filters.view} />
                <IssuesToolbar filters={filters} />
                {viewerUserId ? (
                    <IssuesBody
                        filters={filters}
                        serverId={server.id}
                        viewerUserId={viewerUserId}
                    />
                ) : null}
            </PageColumn>
        </div>
    );
}

function IssueViewTabs({ view }: { view: IssuesPageFilters['view'] }) {
    const setParam = useSetSearchParam();
    return (
        <Tabs
            onSelectionChange={(key) => setParam('view', key === 'for-you' ? null : String(key))}
            selectedKey={view}
            variant="secondary"
        >
            <Tabs.ListContainer>
                <Tabs.List aria-label="Issues">
                    {issueViews.map((entry) => (
                        <Tabs.Tab id={entry.id} key={entry.id}>
                            {entry.label}
                            <Tabs.Indicator />
                        </Tabs.Tab>
                    ))}
                </Tabs.List>
            </Tabs.ListContainer>
        </Tabs>
    );
}

function IssuesBody({
    filters,
    serverId,
    viewerUserId,
}: {
    filters: IssuesPageFilters;
    serverId: string;
    viewerUserId: string;
}) {
    const list = useIssueList(serverId, issueListInput(filters, viewerUserId));
    const { label } = filters;
    const issues = React.useMemo(
        () => (list.data ? filterIssues(list.data, { label }) : null),
        [list.data, label]
    );
    if (issues === null) {
        return list.error ? <IssuesEmpty filtered={false} unavailable /> : null;
    }
    if (filters.layout === 'board') {
        return <IssueBoard issues={issues} />;
    }
    return issues.length === 0 ? (
        <IssuesEmpty filtered={isFiltered(filters)} />
    ) : (
        <IssueList issues={issues} />
    );
}

function IssuesEmpty({
    filtered,
    unavailable = false,
}: {
    filtered: boolean;
    unavailable?: boolean;
}) {
    const title = unavailable
        ? 'Issues unavailable'
        : filtered
          ? 'No matching issues'
          : 'No issues here';
    return (
        <EmptyState>
            <EmptyState.Header>
                <EmptyState.Media variant="icon">
                    <Icon aria-hidden="true" icon={unavailable ? Alert02Icon : TaskDone01Icon} />
                </EmptyState.Media>
                <EmptyState.Title>{title}</EmptyState.Title>
            </EmptyState.Header>
            {filtered && !unavailable ? (
                <EmptyState.Content>
                    <ClearFiltersButton names={issueFilterNames} variant="secondary" />
                </EmptyState.Content>
            ) : null}
        </EmptyState>
    );
}
