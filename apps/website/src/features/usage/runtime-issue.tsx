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
                    aria-label={`${title}: ${issue === 'authentication' ? 'how to fix sign-in' : 'usage details'}`}
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
                        ? `${title} sign-in required`
                        : `${title} usage unavailable`}
                </h3>
                <div className="mt-2 grid gap-3 text-sm">
                    {issue === 'authentication' ? (
                        <>
                            <p>Haus couldn’t use the saved credentials on {computerName}.</p>
                            <p className="text-muted">
                                Open a terminal on that Computer and sign in again
                                {command ? ' with:' : '.'}
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
