import { EmptyState } from '@heroui-pro/react';
import { File01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { type ReactNode, useMemo } from 'react';
import { agentHtmlSandbox } from '../../agent-html/sandbox.ts';
import { agentHtmlTokenCss, injectHostTokenStyle } from '../../agent-html/tokens.ts';
import { useResolvedThemeOptional } from '../../components/theme-provider.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { codeLanguageForPath, countCodeLines } from '../../lib/code-language.ts';
import { WorkspaceCodeView } from './chat-artifact-workspace-code-view.tsx';
import {
    isWorkspaceMarkdownFile,
    isWorkspaceSourceFile,
    type WorkspaceArtifact,
} from './chat-artifact-workspace-file.tsx';
import { ChatMarkdownText } from './chat-markdown-text.tsx';
import type { HausResourceTarget } from './haus-resource-link.ts';

export function WorkspaceArtifactContent({
    agentId,
    artifact,
    controls,
    target,
}: {
    agentId: string;
    artifact: WorkspaceArtifact;
    controls?: ReactNode;
    target: Extract<HausResourceTarget, { kind: 'workspaceFile' }>;
}) {
    const { fileQuery, raw } = artifact;

    if (!agentId) {
        return (
            <WorkspaceArtifactEmpty
                detail="No active agent workspace is available."
                title={target.path}
            />
        );
    }

    if (fileQuery.isPending) {
        return <WorkspaceArtifactEmpty detail="Loading workspace file..." title={target.path} />;
    }

    if (fileQuery.error) {
        return (
            <WorkspaceArtifactEmpty
                detail="Unable to load this workspace file."
                title={target.path}
            />
        );
    }

    const file = fileQuery.data;
    const sourceFile = isWorkspaceSourceFile(file);
    const codeView = sourceFile && (raw || !isWorkspaceMarkdownFile(file, target.path));

    if (file.binary && !file.mediaType.startsWith('image/')) {
        return (
            <WorkspaceArtifactEmpty
                detail="Binary files cannot be previewed here yet."
                title={target.path}
            />
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col">
            {controls}
            {file.truncated ? (
                <div className="shrink-0 border-separator border-b bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
                    Preview truncated. This file is {formatWorkspaceFileBytes(file.sizeBytes)}.
                </div>
            ) : null}
            <div className="min-h-0 flex-1">
                <WorkspaceFilePreview
                    content={file.content}
                    mediaType={file.mediaType}
                    path={target.path}
                    raw={raw}
                    target={target}
                />
            </div>
            {/* File facts are status, not chrome: a quiet hairline-topped footer
                keeps them available without competing with the bar above, on
                the band's px-3 chrome gutter. Language sits trailing,
                editor-status-bar style. */}
            <div className="workspace-file-footer flex shrink-0 items-center justify-between gap-3 px-3 py-1.5">
                <span className="min-w-0 truncate text-muted text-xs tabular-nums">
                    {formatWorkspaceFileMetadata(file.sizeBytes, file.updatedAt, {
                        lineCount: codeView ? countCodeLines(file.content) : null,
                    })}
                </span>
                {sourceFile ? (
                    <span className="shrink-0 text-muted text-xs">
                        {codeLanguageForPath(target.path).label}
                    </span>
                ) : null}
            </div>
        </div>
    );
}

function WorkspaceFilePreview({
    content,
    mediaType,
    path,
    raw,
    target,
}: {
    content: string;
    mediaType: string;
    path: string;
    raw: boolean;
    target: Extract<HausResourceTarget, { kind: 'workspaceFile' }>;
}) {
    if (mediaType.startsWith('image/')) {
        return (
            <div className="grid h-full min-h-0 place-items-center overflow-auto bg-surface-secondary p-6">
                <img
                    alt={path}
                    className="h-auto max-h-full w-auto max-w-full rounded-md border border-separator bg-background object-contain"
                    height={768}
                    src={`data:${mediaType};base64,${content}`}
                    width={1024}
                />
            </div>
        );
    }
    if (mediaType === 'text/html') {
        return <WorkspaceHtmlPreview content={content} path={path} />;
    }
    if (!raw && isWorkspaceMarkdownFile({ mediaType }, path)) {
        return (
            <div className="h-full overflow-auto px-6 py-5 text-base">
                <ChatMarkdownText content={content} />
            </div>
        );
    }
    return <WorkspaceCodeView content={content} path={path} target={target} />;
}

export function formatWorkspaceFileMetadata(
    sizeBytes: number,
    updatedAt: string | null,
    { lineCount = null }: { lineCount?: number | null } = {}
) {
    const parts = [formatWorkspaceFileBytes(sizeBytes)];
    if (lineCount !== null) {
        parts.push(`${lineCount.toLocaleString()} ${lineCount === 1 ? 'line' : 'lines'}`);
    }
    if (updatedAt) {
        parts.push(
            `Modified ${new Intl.DateTimeFormat(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
            }).format(new Date(updatedAt))}`
        );
    }
    return parts.join(' · ');
}

export function formatWorkspaceFileBytes(sizeBytes: number) {
    if (sizeBytes < 1024) {
        return `${sizeBytes} B`;
    }
    if (sizeBytes < 1024 * 1024) {
        return `${(sizeBytes / 1024).toFixed(1)} KB`;
    }
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Sandboxed HTML preview with host tokens riding in: artifacts (and any
 * workspace HTML file) get the app's resolved theme variables injected, so a
 * page styled with tokens wears the Haus look and follows the app scheme.
 * Opaque origin, never allow-same-origin.
 */
function WorkspaceHtmlPreview({ content, path }: { content: string; path: string }) {
    const scheme = useResolvedThemeOptional();
    const srcDoc = useMemo(
        () => injectHostTokenStyle(content, agentHtmlTokenCss(scheme)),
        [content, scheme]
    );

    return (
        <iframe
            className="h-full min-h-0 w-full"
            sandbox={agentHtmlSandbox}
            srcDoc={srcDoc}
            style={{ colorScheme: scheme }}
            title={path}
        />
    );
}

export function WorkspaceArtifactEmpty({ detail, title }: { detail: string; title: string }) {
    return (
        // Upper third, not dead center: a vertically centered message in a
        // tall pane floats unanchored. Stock EmptyState anatomy, like every
        // other empty state in the app — the hand-rolled bordered icon box
        // this replaces matched nothing.
        <div className="flex h-full min-h-0 justify-center overflow-auto px-8 pt-[18vh]">
            <EmptyState>
                <EmptyState.Header>
                    <EmptyState.Media variant="icon">
                        <Icon className="size-5" icon={File01Icon} />
                    </EmptyState.Media>
                    <EmptyState.Title className="max-w-sm truncate">{title}</EmptyState.Title>
                    <EmptyState.Description className="max-w-sm text-pretty">
                        {detail}
                    </EmptyState.Description>
                </EmptyState.Header>
            </EmptyState>
        </div>
    );
}
