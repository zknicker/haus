import { type Agent, type ArtifactRecord, artifactPathKey } from '@haus/api';
import { Button } from '@heroui/react';
import { PencilEdit02Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { useDriveFolderFiles } from '../../../hooks/artifacts/use-drive-folder-files.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { ArtifactDocument } from '../../artifacts/artifact-document.tsx';
import { artifactTextRenderer } from '../../artifacts/artifact-text.ts';
import { useArtifactCreatorDirectory } from '../../artifacts/use-artifact-creator-directory.ts';
import { useArtifactTextSession } from '../../artifacts/use-artifact-text-session.ts';
import { taskAge } from '../../tasks/tasks-page-model.ts';
import { CaptainListEmpty } from '../captain-list.tsx';
import { AgentsMdView } from './agents-md-view.tsx';

export function CaptainAgentsMd({ agent, server }: { agent: Agent; server: ServerDetail }) {
    const path = `agents/${agent.handle}/AGENTS.md`;
    const listing = useDriveFolderFiles(server.id, `agents/${agent.handle}`);
    const [editing, setEditing] = React.useState(false);
    if (listing.error) {
        return <CaptainListEmpty>{listing.error.message}</CaptainListEmpty>;
    }
    if (!listing.files) {
        return null;
    }
    const file = listing.files.find(
        (entry) => artifactPathKey(entry.path) === artifactPathKey(path)
    );
    const renderer = file ? artifactTextRenderer(file) : null;
    if (!(file && renderer)) {
        return <CaptainListEmpty>{agent.displayName} has no AGENTS.md yet.</CaptainListEmpty>;
    }

    return editing ? (
        <AgentsMdEditor
            artifact={file}
            key={file.artifact_id}
            onDone={() => setEditing(false)}
            renderer={renderer}
            serverId={server.id}
        />
    ) : (
        <div className="flex min-w-0 flex-col gap-3">
            <div className="flex min-w-0 items-center gap-2 px-2">
                <LastEdit artifact={file} serverId={server.id} />
                <Button onPress={() => setEditing(true)} size="sm" variant="tertiary">
                    <Icon aria-hidden="true" icon={PencilEdit02Icon} size={14} />
                    Edit
                </Button>
            </div>
            <div className="px-2">
                <AgentsMdView artifact={file} renderer={renderer} serverId={server.id} />
            </div>
        </div>
    );
}

function AgentsMdEditor({
    artifact,
    onDone,
    renderer,
    serverId,
}: {
    artifact: ArtifactRecord;
    onDone: () => void;
    renderer: NonNullable<ReturnType<typeof artifactTextRenderer>>;
    serverId: string;
}) {
    const session = useArtifactTextSession({ artifact, pinnedRevisionId: undefined, serverId });
    return (
        <div className="flex min-w-0 flex-col gap-3">
            <div className="flex min-w-0 items-center justify-end gap-2 px-2">
                {session.dirty ? (
                    <>
                        <Button onPress={session.discard} size="sm" variant="ghost">
                            Discard
                        </Button>
                        <Button
                            isPending={session.saving}
                            onPress={session.save}
                            size="sm"
                            variant="primary"
                        >
                            Save
                        </Button>
                    </>
                ) : (
                    <Button onPress={onDone} size="sm" variant="secondary">
                        Done
                    </Button>
                )}
            </div>
            <div className="px-2">
                <ArtifactDocument
                    artifact={artifact}
                    autoFocus
                    mode="rendered"
                    renderer={renderer}
                    serverId={serverId}
                    session={session}
                />
            </div>
        </div>
    );
}

function LastEdit({ artifact, serverId }: { artifact: ArtifactRecord; serverId: string }) {
    const now = useRelativeNow(60_000);
    const directory = useArtifactCreatorDirectory(serverId);
    const age = taskAge({ createdAt: artifact.updated_at }, now);
    return (
        <p className="text-muted flex min-w-0 flex-1 items-center gap-1.5 text-sm">
            <EntityAvatar {...directory.avatar(artifact.author)} size={16} />
            <span className="min-w-0 truncate">
                {directory.name(artifact.author)} edited {age === 'now' ? 'just now' : `${age} ago`}
            </span>
        </p>
    );
}
