import type { IssueDetail } from '@haus/api';
import { EmptyState } from '@heroui-pro/react';
import { Button } from '@heroui/react';
import { Alert02Icon } from '@hugeicons-pro/core-stroke-rounded';
import { RelativeTime } from '../../components/time/relative-time.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { useIssueDetail } from '../../hooks/issues/use-issue-list.ts';
import { useSetIssueSubscription } from '../../hooks/issues/use-issue-mutations.ts';
import { useServerContext } from '../servers/server-context.ts';
import { PageColumn } from '../shell/page-column.tsx';
import { IssueActivity } from './issue-activity.tsx';
import { IssueDescription } from './issue-description.tsx';
import { IssueMenu } from './issue-menu.tsx';
import { IssueProperties } from './issue-properties.tsx';
import { IssueLinkedTasks, IssuePullRequests, IssueSubIssues } from './issue-sections.tsx';

export function IssuePage({ code }: { code: string }) {
    const { server } = useServerContext();
    const { data, error } = useIssueDetail(server.id, code);
    if (!data) {
        return error ? <IssueMissing message={error.message} /> : null;
    }
    return (
        <div className="min-h-0 flex-1 overflow-y-auto">
            <PageColumn className="issue-page">
                <IssueHeader detail={data} />
                <IssueDescription issue={data.issue} key={data.issue.id} />
                <IssueLinkedTasks issue={data.issue} />
                <IssuePullRequests pullRequests={data.pullRequests} />
                <IssueSubIssues subIssues={data.subIssues} />
                <IssueActivity detail={data} key={data.issue.id} />
            </PageColumn>
        </div>
    );
}

export function IssueBandControls({ code }: { code: string }) {
    const { server } = useServerContext();
    const { data } = useIssueDetail(server.id, code);
    if (!data) {
        return null;
    }
    return (
        <>
            <SubscribeButton detail={data} />
            <IssueMenu issue={data.issue} />
        </>
    );
}

function IssueHeader({ detail }: { detail: IssueDetail }) {
    const { issue } = detail;
    return (
        <header className="issue-header">
            <p className="issue-header__meta">
                {issue.code} · opened <RelativeTime value={issue.createdAt} />
            </p>
            <h1 className="issue-header__title">{issue.title}</h1>
            <IssueProperties issue={issue} />
        </header>
    );
}

function SubscribeButton({ detail }: { detail: IssueDetail }) {
    const subscription = useSetIssueSubscription();
    const subscribed = subscription.isPending
        ? (subscription.variables?.subscribed ?? detail.subscribed)
        : detail.subscribed;
    return (
        <Button
            onPress={() =>
                subscription.mutate({
                    issueId: detail.issue.id,
                    serverId: detail.issue.serverId,
                    subscribed: !subscribed,
                })
            }
            size="sm"
            variant="ghost"
        >
            {subscribed ? 'Unsubscribe' : 'Subscribe'}
        </Button>
    );
}

function IssueMissing({ message }: { message: string }) {
    return (
        <EmptyState>
            <EmptyState.Header>
                <EmptyState.Media variant="icon">
                    <Icon aria-hidden="true" icon={Alert02Icon} />
                </EmptyState.Media>
                <EmptyState.Title>Issue unavailable</EmptyState.Title>
                <EmptyState.Description>{message}</EmptyState.Description>
            </EmptyState.Header>
        </EmptyState>
    );
}
