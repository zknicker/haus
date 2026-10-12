import { Button, SearchField } from '@heroui/react';
import { EmptyState, Segment } from '@heroui-pro/react';
import { useDeferredValue, useState } from 'react';
import { useArtifacts } from '../../hooks/artifacts/use-artifacts.ts';
import { SectionHeader } from '../shell/section-header.tsx';
import { PageTopbar } from '../shell/shell-topbar.tsx';
import { ArtifactGrid, ArtifactList } from './artifact-collection.tsx';
import { ArtifactLayoutControl, ArtifactRefreshButton } from './artifact-toolbar.tsx';

type Kind = 'all' | 'images' | 'documents' | 'media' | 'other';
const filters: { id: Kind; title: string }[] = [
    { id: 'all', title: 'All files' },
    { id: 'images', title: 'Images' },
    { id: 'documents', title: 'Documents' },
    { id: 'media', title: 'Audio & video' },
    { id: 'other', title: 'Other' },
];
export function ArtifactsContent({ serverId, slug }: { serverId: string; slug: string }) {
    const [offset, setOffset] = useState(0);
    const [search, setSearch] = useState('');
    const [kind, setKind] = useState<Kind>('all');
    const [layout, setLayout] = useState<'grid' | 'list'>('grid');
    const query = useArtifacts(serverId, offset, { query: useDeferredValue(search), kind });
    return (
        <section aria-label="Artifacts" className="flex min-h-0 flex-1 flex-col">
            <PageTopbar>
                <SectionHeader title="Artifacts">
                    <SearchField
                        aria-label="Search artifacts"
                        className="w-48 max-w-full"
                        onChange={(value) => {
                            setSearch(value);
                            setOffset(0);
                        }}
                        value={search}
                    >
                        <SearchField.Group>
                            <SearchField.SearchIcon />
                            <SearchField.Input placeholder="Search files…" />
                            <SearchField.ClearButton />
                        </SearchField.Group>
                    </SearchField>
                    <ArtifactLayoutControl layout={layout} onChange={setLayout} />
                    <ArtifactRefreshButton onRefresh={() => query.refetch()} />
                </SectionHeader>
            </PageTopbar>
            <div className="flex shrink-0 items-center overflow-x-auto px-4 py-2">
                <Segment
                    aria-label="File type"
                    className="w-fit shrink-0"
                    onSelectionChange={(value) => {
                        const filter = filters.find((item) => item.id === value);
                        if (filter) {
                            setKind(filter.id);
                            setOffset(0);
                        }
                    }}
                    selectedKey={kind}
                    size="sm"
                >
                    {filters.map((filter) => (
                        <Segment.Item id={filter.id} key={filter.id}>
                            {filter.title}
                        </Segment.Item>
                    ))}
                </Segment>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                {query.error ? (
                    <p role="alert">{query.error.message}</p>
                ) : query.data ? (
                    query.data.artifacts.length === 0 ? (
                        <ArtifactEmptyState filtered={Boolean(search) || kind !== 'all'} />
                    ) : layout === 'grid' ? (
                        <ArtifactGrid
                            artifacts={query.data.artifacts}
                            serverId={serverId}
                            slug={slug}
                        />
                    ) : (
                        <ArtifactList
                            artifacts={query.data.artifacts}
                            serverId={serverId}
                            slug={slug}
                        />
                    )
                ) : (
                    <section aria-label="Loading artifacts" className="min-h-32" />
                )}
            </div>
            <footer className="flex shrink-0 items-center justify-between gap-3 px-4 py-2">
                <span className="text-muted text-xs">
                    {fileCountLabel(query.data?.artifacts.length ?? 0)} on this page
                </span>
                <div className="flex gap-2">
                    <Button
                        isDisabled={offset === 0}
                        onPress={() => setOffset(Math.max(0, offset - 50))}
                        size="sm"
                        variant="ghost"
                    >
                        Previous
                    </Button>
                    <Button
                        isDisabled={!query.data || query.data.artifacts.length < 50}
                        onPress={() => setOffset(offset + 50)}
                        size="sm"
                        variant="ghost"
                    >
                        Next
                    </Button>
                </div>
            </footer>
        </section>
    );
}

function fileCountLabel(count: number) {
    return `${count} ${count === 1 ? 'file' : 'files'}`;
}

function ArtifactEmptyState({ filtered }: { filtered: boolean }) {
    return (
        <EmptyState>
            <EmptyState.Header>
                <EmptyState.Title>
                    {filtered ? 'No matching files' : 'No artifacts here'}
                </EmptyState.Title>
                <EmptyState.Description>
                    {filtered
                        ? 'Try another search or file type.'
                        : 'Files agents publish to this Server appear here.'}
                </EmptyState.Description>
            </EmptyState.Header>
        </EmptyState>
    );
}
