import { type Agent, artifactPathKey } from '@haus/api';
import { useNavigate } from 'react-router-dom';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { useDriveFolderFiles } from '../../../hooks/artifacts/use-drive-folder-files.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { artifactViewerHref, libraryHref } from '../../artifacts/library-params.ts';
import { taskAge } from '../../tasks/tasks-page-model.ts';
import { CaptainListGroup, CaptainListRow, CaptainListRows } from './captain-list.tsx';

const ruleFiles = ['AGENTS.md', 'WORKER.md', 'MEMORY.md'] as const;

export function AgentDrive({ agent, server }: { agent: Agent; server: ServerDetail }) {
    const navigate = useNavigate();
    const now = useRelativeNow(60_000);
    const folder = `agents/${agent.handle}`;
    const listing = useDriveFolderFiles(server.id, folder);
    if (!listing.files) {
        return null;
    }
    const view = { creator: null, folder, kind: 'all' } as const;
    const folderHref = libraryHref(server.slug, view);
    const rows = ruleFiles.map((name) => {
        const file = listing.files?.find(
            (entry) => artifactPathKey(entry.path) === artifactPathKey(`${folder}/${name}`)
        );
        return {
            href: file
                ? artifactViewerHref(server.slug, file.artifact_id, { ...view, query: '' })
                : folderHref,
            name,
            updatedAt: file?.updated_at ?? null,
        };
    });

    return (
        <CaptainListGroup
            action={{ label: 'All files', onPress: () => navigate(folderHref) }}
            count={rows.length}
            title="Drive"
        >
            <CaptainListRows
                label="Drive"
                onAction={(id) => {
                    const row = rows.find((candidate) => candidate.name === id);
                    if (row) {
                        navigate(row.href);
                    }
                }}
            >
                {rows.map((row) => (
                    <CaptainListRow
                        age={
                            row.updatedAt
                                ? taskAge({ createdAt: row.updatedAt }, now)
                                : 'Not created'
                        }
                        id={row.name}
                        key={row.name}
                        textValue={row.name}
                        title={row.name}
                    />
                ))}
            </CaptainListRows>
        </CaptainListGroup>
    );
}
