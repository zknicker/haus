import type { WorkerRuntime } from '@haus/api';
import { Button, Popover } from '@heroui/react';
import { CodeSnippet } from '../../components/code-snippet.tsx';
import { RuntimeIssueHelpContent } from '../usage/runtime-issue.tsx';
import { runtimeLoginCommand } from './runtime-issue-model.ts';

export function RuntimeFixPopover({
    computerName,
    detail,
    runtimeId,
    status,
    title,
}: {
    computerName: string;
    detail: string | null;
    runtimeId: WorkerRuntime;
    status: 'not-ready' | 'signed-out';
    title: string;
}) {
    return (
        <Popover>
            <Button aria-label={`Fix ${title}`} size="sm" variant="secondary">
                Fix
            </Button>
            <Popover.Content offset={8} placement="bottom end">
                <Popover.Dialog aria-label={`${title} sign-in`}>
                    <div className="flex w-72 flex-col gap-2 p-3 text-sm">
                        {status === 'signed-out' ? (
                            <RuntimeIssueHelpContent
                                computerName={computerName}
                                issue="authentication"
                                runtimeId={runtimeId}
                                title={title}
                            />
                        ) : (
                            <NotSignedInHelp
                                computerName={computerName}
                                detail={detail}
                                runtimeId={runtimeId}
                                title={title}
                            />
                        )}
                    </div>
                </Popover.Dialog>
            </Popover.Content>
        </Popover>
    );
}

function NotSignedInHelp({
    computerName,
    detail,
    runtimeId,
    title,
}: {
    computerName: string;
    detail: string | null;
    runtimeId: WorkerRuntime;
    title: string;
}) {
    const command = runtimeLoginCommand(runtimeId);
    return (
        <>
            <p>
                {detail ?? `${title} isn’t signed in on ${computerName}.`} Sign in from a terminal
                there{command ? ':' : '.'}
            </p>
            {command ? <CodeSnippet lines={command} /> : null}
        </>
    );
}
