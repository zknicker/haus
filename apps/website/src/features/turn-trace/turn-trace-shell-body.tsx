import { Disclosure } from '@heroui/react';
import * as React from 'react';
import { ReferenceMarkdown } from '../mentions/reference-markdown.tsx';
import {
    TraceMicroLabel,
    TraceSection,
    TurnTraceCode,
    TurnTraceFact,
} from './turn-trace-blocks.tsx';
import type { HausMessage } from './turn-trace-haus-command.ts';
import type { TurnTraceTool } from './turn-trace-tool-model.ts';
import { clampTraceText, readShellOutput } from './turn-trace-values.ts';

/** A shell call's body: a sent message reads as the message, anything else as its evidence. */
export function ShellBody({ tool }: { tool: TurnTraceTool }) {
    if (tool.hausMessage) {
        return <HausMessageBody message={tool.hausMessage} tool={tool} />;
    }
    // A failure already states itself in one line above; the raw evidence waits behind it.
    if (tool.failure) {
        return (
            <CommandDisclosure>
                <ShellEvidence tool={tool} />
            </CommandDisclosure>
        );
    }
    return <ShellEvidence tool={tool} />;
}

/**
 * A sent message reads as the message: where it went and what it said. The
 * command and the CLI's reply are debugging evidence, one quiet press away.
 */
function HausMessageBody({ message, tool }: { message: HausMessage; tool: TurnTraceTool }) {
    const place = message.place ? `${message.place}${message.isThread ? ' thread' : ''}` : null;
    const body = message.body?.trim() ? clampTraceText(message.body).text : null;
    return (
        <>
            {place ? <TurnTraceFact label="To" value={place} /> : null}
            {/* No readable body (a saved draft, a piped echo): the Command still has it. */}
            {body ? (
                <TraceSection label="Message">
                    <ReferenceMarkdown
                        className="chat-markdown text-foreground text-sm"
                        content={body}
                    />
                </TraceSection>
            ) : null}
            <CommandDisclosure>
                <ShellEvidence tool={tool} />
            </CommandDisclosure>
        </>
    );
}

/**
 * The raw command and what it printed, one quiet press away: a stock
 * Disclosure whose trigger is the section's own micro label, so evidence
 * behind it never reads as one more row of the trace.
 */
function CommandDisclosure({ children }: { children: React.ReactNode }) {
    // Mounted on first open, like a row's body: closed evidence is not in the page.
    const [opened, setOpened] = React.useState(false);
    return (
        <Disclosure onExpandedChange={(next) => next && setOpened(true)}>
            <Disclosure.Heading>
                <Disclosure.Trigger className="flex items-center gap-1 text-muted">
                    <TraceMicroLabel>Command</TraceMicroLabel>
                    <Disclosure.Indicator />
                </Disclosure.Trigger>
            </Disclosure.Heading>
            <Disclosure.Content>
                {opened ? <div className="grid min-w-0 gap-2 pt-1">{children}</div> : null}
            </Disclosure.Content>
        </Disclosure>
    );
}

function ShellEvidence({ tool }: { tool: TurnTraceTool }) {
    const shell = readShellOutput(tool.output);
    // A non-zero exit journals its output as the failure message (see `readCallFailure`).
    const failedOutput =
        tool.failure && tool.failure.exitCode !== null && !shell.stdout && !shell.stderr
            ? tool.failure.message
            : null;

    return (
        <>
            {tool.command ? (
                <TurnTraceCode code={tool.command} label="Command" language="shellscript" />
            ) : null}
            {shell.stdout || failedOutput ? (
                <TurnTraceCode code={shell.stdout || failedOutput || ''} label="Output" />
            ) : null}
            {shell.stderr ? <TurnTraceCode code={shell.stderr} label="Standard error" /> : null}
            {/* A failed call already states its exit code above its evidence. */}
            {tool.failure || shell.exitCode === null || shell.exitCode === 0 ? null : (
                <TurnTraceFact label="Exit code" value={String(shell.exitCode)} />
            )}
        </>
    );
}
