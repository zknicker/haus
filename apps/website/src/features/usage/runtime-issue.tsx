import type { ComputerRuntimeId } from '@haus/api';
import { Button } from '@heroui/react';
import { HoverCard } from '@heroui-pro/react';
import { Alert02Icon, HelpCircleIcon } from '@hugeicons-pro/core-stroke-rounded';
import { CodeSnippet } from '../../components/code-snippet.tsx';
import { hausHoverCardClassName } from '../../components/ui/cursor-hover-card.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { cn } from '../../lib/utils.ts';
import { runtimeLoginCommand } from '../computers/runtime-issue-model.ts';
import {
    ReferencePreviewHeader,
    ReferencePreviewText,
} from '../mentions/reference-preview-header.tsx';
import type { RuntimeIssue } from './runtime-usage-row.ts';

export function RuntimeIssueHelp({
    issue,
    runtimeId,
    title,
    computerName,
}: {
    issue: RuntimeIssue;
    runtimeId: ComputerRuntimeId;
    title: string;
    computerName: string;
}) {
    return (
        <HoverCard openDelay={250}>
            <HoverCard.Trigger>
                <Button
                    aria-label={`${title}: ${issue === 'authentication' ? 'authentication details' : 'usage details'}`}
                    isIconOnly
                    size="sm"
                    variant="ghost"
                >
                    <Icon icon={HelpCircleIcon} size={16} />
                </Button>
            </HoverCard.Trigger>
            <HoverCard.Content
                aria-label={`${title} help`}
                className={cn(hausHoverCardClassName, 'w-72')}
                placement="bottom end"
            >
                <RuntimeIssueHelpContent
                    computerName={computerName}
                    issue={issue}
                    runtimeId={runtimeId}
                    title={title}
                />
            </HoverCard.Content>
        </HoverCard>
    );
}

export function RuntimeIssueHelpContent({
    issue,
    runtimeId,
    title,
    computerName,
}: {
    issue: RuntimeIssue;
    runtimeId: ComputerRuntimeId;
    title: string;
    computerName: string;
}) {
    const command = runtimeLoginCommand(runtimeId);
    const mark = (
        <Icon
            aria-hidden="true"
            className="shrink-0 text-warning"
            icon={Alert02Icon}
            size={16}
            style={{ height: 16, width: 16 }}
        />
    );

    if (issue === 'usage') {
        return (
            <ReferencePreviewHeader mark={mark} meta="Usage unavailable" title={title}>
                <ReferencePreviewText>
                    Couldn’t refresh plan limits. Agents can still run; meters show the last
                    reported values.
                </ReferencePreviewText>
            </ReferencePreviewHeader>
        );
    }

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <ReferencePreviewHeader mark={mark} meta="Sign-in failed" title={title}>
                <ReferencePreviewText>
                    The last attempt failed on {computerName}. If {title} already works there, retry
                    the Agent’s request. Otherwise sign in from a terminal
                    {command ? ' there:' : ' there.'}
                </ReferencePreviewText>
            </ReferencePreviewHeader>
            {command ? <CodeSnippet lines={command} /> : null}
            <ReferencePreviewText>
                {runtimeId === 'claude-code'
                    ? 'Then refresh Runtimes to clear this warning and retry the request.'
                    : 'Then retry the request; a successful turn clears this warning.'}
            </ReferencePreviewText>
        </div>
    );
}
