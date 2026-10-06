import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { TurnTraceProse } from './turn-trace-blocks.tsx';
import { type TurnTraceWorkspace, useTurnTraceScope } from './turn-trace-scope.tsx';
import type { TurnTraceImage } from './turn-trace-tool-model.ts';

/**
 * What an image step made, shown in place: the picture itself, read from the
 * Agent's workspace copy through the same `agent.workspaceFile` read the
 * workspace pane uses, then the prompt behind it. Nothing renders while the
 * file loads; a video, a host-only path, or a failed read names the file.
 */
export function TurnTraceImagePreview({ image }: { image: TurnTraceImage }) {
    const { workspace } = useTurnTraceScope();
    const previewable = image.media === 'image' && image.workspacePath !== null && workspace;

    return (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] justify-items-start gap-1.5 ps-5.5 pb-2">
            {previewable ? (
                <WorkspaceImage path={image.workspacePath as string} workspace={workspace} />
            ) : (
                <ImageFileName image={image} />
            )}
            {image.prompt ? <TurnTraceProse text={image.prompt} /> : null}
        </div>
    );
}

function WorkspaceImage({ path, workspace }: { path: string; workspace: TurnTraceWorkspace }) {
    const file = useTraceWorkspaceImage(path, workspace);

    if (file.isPending) {
        return null;
    }
    if (!file.data?.mediaType.startsWith('image/')) {
        return <p className="text-muted text-sm">{`${path} · preview unavailable`}</p>;
    }
    return (
        <img
            alt={path}
            className="h-auto max-h-60 w-auto max-w-full rounded-md border border-separator bg-background object-contain"
            // Generated images are square by default; the attributes only seed
            // the aspect ratio before the data URI decodes.
            height={1024}
            src={`data:${file.data.mediaType};base64,${file.data.content}`}
            width={1024}
        />
    );
}

function ImageFileName({ image }: { image: TurnTraceImage }) {
    if (!image.file) {
        return null;
    }
    return (
        <p className="flex min-w-0 max-w-full items-baseline gap-2 text-sm">
            <span className="min-w-0 truncate text-foreground">{image.file.name}</span>
            {image.file.dir ? (
                <span className="min-w-0 truncate text-muted">{image.file.dir}</span>
            ) : null}
        </p>
    );
}

/** The one read behind an image step: the Agent's workspace file, cached like the workspace pane's. */
function useTraceWorkspaceImage(path: string, workspace: TurnTraceWorkspace) {
    return hausTrpc.agent.workspaceFile.useQuery(
        { agentId: workspace.agentId, includeHidden: false, path, serverId: workspace.serverId },
        { ...queryPolicy.computerSnapshot, retry: false }
    );
}
