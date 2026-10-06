import { ToggleButton } from '@heroui/react';
import { useState } from 'react';
import { CopyButton } from '../../components/copy-button.tsx';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import type { HausResourceTarget } from './haus-resource-link.ts';

type WorkspaceFileTarget = Extract<HausResourceTarget, { kind: 'workspaceFile' }>;

export function useWorkspaceArtifact({
    agentId,
    includeHidden,
    serverId,
    target,
}: {
    agentId: string;
    includeHidden: boolean;
    serverId: string;
    target: WorkspaceFileTarget | null;
}) {
    const fileQuery = hausTrpc.agent.workspaceFile.useQuery(
        { agentId, includeHidden, path: target?.path ?? '', serverId },
        { ...queryPolicy.computerSnapshot, enabled: agentId.length > 0 && target !== null }
    );
    const [rawPath, setRawPath] = useState<string | null>(null);

    return {
        fileQuery,
        raw: target !== null && rawPath === target.path,
        setRaw: (selected: boolean) => setRawPath(selected && target ? target.path : null),
        target,
    };
}

export type WorkspaceArtifact = ReturnType<typeof useWorkspaceArtifact>;

export function WorkspaceArtifactControls({ artifact }: { artifact: WorkspaceArtifact }) {
    const { fileQuery, raw, setRaw, target } = artifact;
    const file = fileQuery.data;
    if (!(file && target && isWorkspaceSourceFile(file))) {
        return null;
    }

    const markdown = isWorkspaceMarkdownFile(file, target.path);

    return (
        <>
            <CopyButton label="Copy file contents" value={file.content} />
            {markdown ? (
                <ToggleButton isSelected={raw} onChange={setRaw} size="sm" variant="ghost">
                    Raw
                </ToggleButton>
            ) : null}
        </>
    );
}

export function WorkspaceArtifactInlineControls({ artifact }: { artifact: WorkspaceArtifact }) {
    const file = artifact.fileQuery.data;
    if (!(file && artifact.target && isWorkspaceSourceFile(file))) {
        return null;
    }

    return (
        <div className="flex shrink-0 items-center justify-end gap-1 py-2 ps-2 pe-3">
            <WorkspaceArtifactControls artifact={artifact} />
        </div>
    );
}

export function isWorkspaceSourceFile(file: { binary: boolean; mediaType: string }) {
    return !(file.binary || file.mediaType.startsWith('image/')) && file.mediaType !== 'text/html';
}

export function isWorkspaceMarkdownFile(file: { mediaType: string }, path: string) {
    return file.mediaType === 'text/markdown' || /\.(?:md|mdx)$/iu.test(path);
}
