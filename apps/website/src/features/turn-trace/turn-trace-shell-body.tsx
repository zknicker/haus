import { CommandLineIcon } from '@hugeicons-pro/core-stroke-rounded';
import { TurnTraceCode, TurnTraceFact } from './turn-trace-blocks.tsx';
import type { HausMessage } from './turn-trace-haus-command.ts';
import { TurnTraceMarkdown } from './turn-trace-reasoning.tsx';
import { TraceDisclosure, TraceLine } from './turn-trace-row.tsx';
import type { TurnTraceTool } from './turn-trace-tool-model.ts';
import { clampTraceText, readShellOutput } from './turn-trace-values.ts';

/** A shell call's body: a sent message reads as the message, anything else as its evidence. */
export function ShellBody({ tool }: { tool: TurnTraceTool }) {
    if (tool.hausMessage) {
        return <HausMessageBody message={tool.hausMessage} tool={tool} />;
    }
    return <ShellEvidence tool={tool} />;
}

/**
 * A sent message reads as the message: where it went and what it said. The
 * command and the CLI's reply are debugging evidence, one quiet press away.
 */
function HausMessageBody({ message, tool }: { message: HausMessage; tool: TurnTraceTool }) {
    const place = message.place ? `${message.place}${message.isThread ? ' thread' : ''}` : null;
    return (
        <>
            {place ? <TurnTraceFact label="To" value={place} /> : null}
            {/* No readable body (a saved draft, a piped echo): the Command still has it. */}
            {message.body?.trim() ? (
                <TurnTraceMarkdown content={clampTraceText(message.body).text} tone="foreground" />
            ) : null}
            <TraceDisclosure line={<TraceLine icon={CommandLineIcon} isQuiet label="Command" />}>
                <ShellEvidence tool={tool} />
            </TraceDisclosure>
        </>
    );
}

export function ShellEvidence({ tool }: { tool: TurnTraceTool }) {
    const shell = readShellOutput(tool.output);

    return (
        <>
            {tool.command ? (
                <TurnTraceCode code={tool.command} label="Command" language="shellscript" />
            ) : null}
            {shell.stdout ? <TurnTraceCode code={shell.stdout} label="Output" /> : null}
            {shell.stderr ? <TurnTraceCode code={shell.stderr} label="Standard error" /> : null}
            {/* A failed call already states its exit code above its evidence. */}
            {tool.failure || shell.exitCode === null || shell.exitCode === 0 ? null : (
                <TurnTraceFact label="Exit code" value={String(shell.exitCode)} />
            )}
        </>
    );
}
