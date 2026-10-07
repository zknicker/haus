import { ReferenceMarkdown } from '../mentions/reference-markdown.tsx';
import { TraceSection, TurnTraceFact, TurnTraceFacts } from './turn-trace-blocks.tsx';
import { TraceValue, TurnTraceCode } from './turn-trace-code.tsx';
import type { HausMessage } from './turn-trace-haus-command.ts';
import type { TurnTraceTool } from './turn-trace-tool-model.ts';
import { clampTraceText, readShellOutput, stripTerminalEscapes } from './turn-trace-values.ts';

/**
 * A shell call's body, whole on open: a sent message leads with where it went
 * and what it said, then every call shows the command and what it printed.
 * A failure's one-line reason already sits above (`TraceErrorSection`).
 */
export function ShellBody({ tool }: { tool: TurnTraceTool }) {
    return (
        <>
            {tool.hausMessage ? <HausMessageSections message={tool.hausMessage} /> : null}
            <ShellEvidence tool={tool} />
        </>
    );
}

function HausMessageSections({ message }: { message: HausMessage }) {
    const place = message.place ? `${message.place}${message.isThread ? ' thread' : ''}` : null;
    const body = message.body?.trim() ? clampTraceText(message.body).text : null;
    return (
        <>
            {place ? (
                <TurnTraceFacts>
                    <TurnTraceFact label="To" value={place} />
                </TurnTraceFacts>
            ) : null}
            {/* No readable body (a saved draft, a piped echo): the command still has it. */}
            {body ? (
                <TraceSection copy={body} label="Message">
                    <ReferenceMarkdown
                        className="chat-markdown text-foreground text-sm"
                        content={body}
                    />
                </TraceSection>
            ) : null}
        </>
    );
}

function ShellEvidence({ tool }: { tool: TurnTraceTool }) {
    const shell = readShellOutput(tool.output);
    // A non-zero exit journals its output as the failure message (see `readCallFailure`).
    const failedOutput =
        tool.failure && tool.failure.exitCode !== null && !shell.stdout && !shell.stderr
            ? tool.failure.message
            : null;
    const output = shell.stdout || failedOutput;
    const stderr = shell.stderr ? stripTerminalEscapes(shell.stderr) : null;

    return (
        <>
            {tool.command ? (
                <TurnTraceCode code={tool.command} label="Command" language="shellscript" />
            ) : null}
            {output ? <TraceValue label="Output" value={stripTerminalEscapes(output)} /> : null}
            {stderr ? <TurnTraceCode code={stderr} label="Standard error" /> : null}
            {/* A failed call already states its exit code above its evidence. */}
            {tool.failure || shell.exitCode === null || shell.exitCode === 0 ? null : (
                <TurnTraceFacts>
                    <TurnTraceFact label="Exit code" value={String(shell.exitCode)} />
                </TurnTraceFacts>
            )}
        </>
    );
}
