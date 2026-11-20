import { Navigate } from 'react-router-dom';
import { artifactPath } from '../../features/artifacts/artifact-format.ts';
import { DrivePageUnavailable } from '../../features/chats/drive-page-pane.tsx';
import type { DrivePageTarget } from '../../features/chats/haus-resource-link.ts';
import { useDrivePage } from '../../hooks/artifacts/use-drive-page.ts';

export function DrivePageRoute({
    serverId,
    slug,
    target,
}: {
    serverId: string;
    slug: string;
    target: DrivePageTarget;
}) {
    const page = useDrivePage(serverId, target);
    if (page.status === 'loading') {
        return null;
    }
    if (page.status !== 'ready') {
        return <DrivePageUnavailable path={target.path} status={page.status} />;
    }
    return (
        <Navigate replace to={artifactPath(slug, page.artifact.artifact_id, target.revisionId)} />
    );
}
