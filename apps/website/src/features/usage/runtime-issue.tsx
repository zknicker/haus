import type { ComputerRuntimeId } from '@haus/api';
import { Button } from '@heroui/react';
import { HoverCard } from '@heroui-pro/react';
import { HelpCircleIcon } from '@hugeicons-pro/core-stroke-rounded';
import { CodeSnippet } from '../../components/code-snippet.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { runtimeLoginCommand } from '../computers/runtime-issue-model.ts';
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
    const command = runtimeLoginCommand(runtimeId);
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
                className="max-w-80"
                placement="bottom end"
            >
                <h3 className="font-medium text-sm">
                    {issue === 'authentication'
                        ? `${title} authentication failed`
                        : `${title} usage unavailable`}
                </h3>
                <div className="mt-2 grid gap-3 text-sm">
                    {issue === 'authentication' ? (
                        <>
                            <p>Haus’s last authentication attempt failed on {computerName}.</p>
                            <p className="text-muted">
                                Retry the Agent’s request if the runtime already works on that
                                Computer. If it also asks you to sign in there, open a terminal
                                {command ? ' and run:' : ' and sign in.'}
                            </p>
                            {command && <CodeSnippet lines={command} />}
                            <p className="text-muted">
                                Then retry the Agent’s request. A successful turn clears the
                                execution warning.
                            </p>
                        </>
                    ) : (
                        <p className="text-muted">
                            Haus couldn’t refresh plan limits from {title}. This alone doesn’t mean
                            Agents can’t run. Try refreshing; any meters shown are the last reported
                            values.
                        </p>
                    )}
                </div>
            </HoverCard.Content>
        </HoverCard>
    );
}
