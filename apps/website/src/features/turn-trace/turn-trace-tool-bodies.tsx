import { ChatSource, ChatSources } from '@heroui-pro/react';
import type { ReactNode } from 'react';
import { buildDiffHunks, countDiffStats } from '../../components/diff/diff-hunks.ts';
import { DiffStatBadge, DiffView } from '../../components/diff/diff-view.tsx';
import { codeLanguageForPath } from '../../lib/code-language.ts';
import {
    TraceSection,
    TurnTraceFact,
    TurnTraceFacts,
    TurnTraceNote,
} from './turn-trace-blocks.tsx';
import { TraceValue, TurnTraceCode } from './turn-trace-code.tsx';
import { ShellBody } from './turn-trace-shell-body.tsx';
import type { TurnTraceTool } from './turn-trace-tool-model.ts';
import {
    clampTraceText,
    readFileDiff,
    readHostname,
    readRecord,
    readString,
    readTraceSources,
    readTraceText,
} from './turn-trace-values.ts';

/** The tool-kind-specific half of a trace row; shared status lives above it. */
export function TurnTraceToolBody({ tool }: { tool: TurnTraceTool }) {
    switch (tool.kind) {
        case 'compaction':
            return <CompactionBody tool={tool} />;
        case 'file-change':
            return <FileChangeBody tool={tool} />;
        case 'file-edit':
            return <FileEditBody tool={tool} />;
        case 'file-read':
        case 'search':
            return <FileLookupBody tool={tool} />;
        case 'file-write':
            return <FileWriteBody tool={tool} />;
        case 'image':
            return <ImageBody tool={tool} />;
        case 'mcp':
            return <McpBody tool={tool} />;
        case 'shell':
            return <ShellBody tool={tool} />;
        case 'web':
            return <WebBody tool={tool} />;
        default:
            return <GenericBody tool={tool} />;
    }
}

/** The runtime owns compaction; the trace only states what it did to the context. */
function CompactionBody({ tool }: { tool: TurnTraceTool }) {
    const output = readRecord(tool.output);
    const before = readTokenCount(output?.tokensBefore);
    const after = readTokenCount(output?.tokensAfter);
    const summary = readString(output?.summary);

    return (
        <>
            {before && after ? (
                <TurnTraceFacts>
                    <TurnTraceFact label="Tokens" value={`${before} → ${after}`} />
                </TurnTraceFacts>
            ) : null}
            {summary ? <TurnTraceCode code={summary} label="Summary" /> : null}
        </>
    );
}

function readTokenCount(value: unknown): string | null {
    return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : null;
}

function FileWriteBody({ tool }: { tool: TurnTraceTool }) {
    return (
        <>
            {tool.path ? (
                <TurnTraceFacts>
                    <TurnTraceFact label="File" value={tool.target?.path ?? tool.path} />
                </TurnTraceFacts>
            ) : null}
            {tool.content ? (
                <TurnTraceCode
                    code={tool.content}
                    label="Contents"
                    language={codeLanguageForPath(tool.path ?? '').id}
                />
            ) : null}
        </>
    );
}

function FileEditBody({ tool }: { tool: TurnTraceTool }) {
    return (
        <FileDiffBody
            after={tool.newText ?? ''}
            before={tool.oldText ?? ''}
            path={tool.target?.path ?? tool.path}
        >
            {tool.replaceAll ? (
                <TurnTraceNote>Applied to every match in the file.</TurnTraceNote>
            ) : null}
        </FileDiffBody>
    );
}

/** A runtime's own file change: its result carries the file's text before and after. */
function FileChangeBody({ tool }: { tool: TurnTraceTool }) {
    const diff = readFileDiff(tool.output, tool.path);
    if (!diff) {
        return tool.path ? (
            <TurnTraceFacts>
                <TurnTraceFact label="File" value={tool.target?.path ?? tool.path} />
            </TurnTraceFacts>
        ) : null;
    }
    if (tool.changeEvent === 'create') {
        return <FileWriteBody tool={{ ...tool, content: diff.after }} />;
    }
    return (
        <FileDiffBody
            after={diff.after}
            before={diff.before}
            path={tool.target?.path ?? tool.path}
        />
    );
}

function FileDiffBody(props: {
    after: string;
    before: string;
    children?: ReactNode;
    path: string | null;
}) {
    // The diff is character-bounded before it is computed: `structuredPatch` is
    // superlinear, and a runtime can hand back an edit of any size.
    const before = clampTraceText(props.before).text;
    const after = clampTraceText(props.after).text;
    const stats = countDiffStats(buildDiffHunks(before, after));

    return (
        <>
            <div className="flex min-w-0 items-baseline justify-between gap-3">
                {props.path ? (
                    <TurnTraceFacts>
                        <TurnTraceFact label="File" value={props.path} />
                    </TurnTraceFacts>
                ) : (
                    <span />
                )}
                <DiffStatBadge additions={stats.additions} deletions={stats.deletions} />
            </div>
            {props.children}
            <DiffView afterText={after} beforeText={before} />
        </>
    );
}

function FileLookupBody({ tool }: { tool: TurnTraceTool }) {
    const text = readTraceText(tool.output);

    return (
        <>
            {tool.pattern || tool.path ? (
                <TurnTraceFacts>
                    {tool.pattern ? <TurnTraceFact label="Pattern" value={tool.pattern} /> : null}
                    {tool.path ? (
                        <TurnTraceFact label="Path" value={tool.target?.path ?? tool.path} />
                    ) : null}
                </TurnTraceFacts>
            ) : null}
            {text ? (
                <TurnTraceCode
                    code={text}
                    label={tool.kind === 'file-read' ? 'Contents' : 'Matches'}
                    language={
                        tool.kind === 'file-read' ? codeLanguageForPath(tool.path ?? '').id : 'text'
                    }
                />
            ) : null}
        </>
    );
}

function WebBody({ tool }: { tool: TurnTraceTool }) {
    const sources = tool.url
        ? [{ title: readHostname(tool.url), url: tool.url }]
        : readTraceSources(tool.output);
    const text = readTraceText(tool.output);

    return (
        <>
            {tool.query ? (
                <TurnTraceFacts>
                    <TurnTraceFact label="Query" value={tool.query} />
                </TurnTraceFacts>
            ) : null}
            <TurnTraceSources sources={sources} />
            {text ? <TraceValue label="Response" value={text} /> : null}
        </>
    );
}

// Favicons would send every visited host to a third-party icon service, so
// sources fall back to ChatSource's own initial mark.
function TurnTraceSources({ sources }: { sources: Array<{ title: string; url: string }> }) {
    if (sources.length === 0) {
        return null;
    }
    if (sources.length === 1 && sources[0]) {
        return <ChatSource href={sources[0].url} title={sources[0].title} />;
    }
    return (
        <ChatSources>
            <ChatSources.Trigger>{`${sources.length} sources`}</ChatSources.Trigger>
            <ChatSources.Content>
                <ChatSources.List>
                    {sources.map((source) => (
                        <ChatSource href={source.url} key={source.url} title={source.title} />
                    ))}
                </ChatSources.List>
            </ChatSources.Content>
        </ChatSources>
    );
}

/** A failed or unpreviewable media call: the file it named and the prompt behind it. */
function ImageBody({ tool }: { tool: TurnTraceTool }) {
    const prompt = tool.image?.prompt ? clampTraceText(tool.image.prompt).text : null;
    return (
        <>
            {tool.image?.file ? (
                <TurnTraceFacts>
                    <TurnTraceFact label="File" value={tool.image.file.path} />
                </TurnTraceFacts>
            ) : null}
            {prompt ? (
                <TraceSection copy={prompt} label="Prompt">
                    <p className="whitespace-pre-wrap break-words text-foreground text-sm">
                        {prompt}
                    </p>
                </TraceSection>
            ) : null}
        </>
    );
}

/** An MCP call: its wire name for the developer reading it, then what went in and came back. */
function McpBody({ tool }: { tool: TurnTraceTool }) {
    return (
        <>
            <TurnTraceFacts>
                <TurnTraceFact label="Tool" value={tool.source.toolName} />
            </TurnTraceFacts>
            <TraceValue label="Input" value={tool.source.input} />
            <TraceValue label="Result" value={readToolResult(tool.output)} />
        </>
    );
}

function GenericBody({ tool }: { tool: TurnTraceTool }) {
    return (
        <>
            <TraceValue label="Input" value={tool.source.input} />
            <TraceValue label="Result" value={readToolResult(tool.output)} />
        </>
    );
}

/**
 * An MCP result wraps its payload in `content: [{ type: 'text', text }]`;
 * the text is the result (often serialized JSON). Anything else is itself.
 */
export function readToolResult(output: unknown): unknown {
    const content = readRecord(output)?.content;
    if (
        Array.isArray(content) &&
        content.length > 0 &&
        content.every((entry) => readRecord(entry)?.type === 'text')
    ) {
        return content.map((entry) => readString(readRecord(entry)?.text) ?? '').join('\n');
    }
    return output;
}
