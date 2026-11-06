import type { EarlierThreadsScope } from '@haus/api';
import { SearchField, ToggleButton, ToggleButtonGroup } from '@heroui/react';
import * as React from 'react';
import { PageBand } from '../../features/shell/page-band.tsx';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';
import { serverRouteModules } from './server-route-modules.ts';

const ThreadsPageContent = React.lazy(async () => ({
    default: (await serverRouteModules.threads()).ThreadsPageContent,
}));

/** Every Thread still in motion, and the ones that have moved on. */
export function ThreadsPage() {
    useWindowTitle('Threads');
    const [filter, setFilter] = React.useState('');
    const [scope, setScope] = React.useState<EarlierThreadsScope>('following');

    return (
        <section aria-label="Threads" className="flex min-h-0 flex-1 flex-col">
            <PageBand>
                <PageBand.Trail current="Threads" />
                <PageBand.Controls>
                    <SearchField
                        aria-label="Filter threads"
                        name="threads-filter"
                        onChange={setFilter}
                        value={filter}
                        variant="secondary"
                    >
                        <SearchField.Group>
                            <SearchField.SearchIcon />
                            <SearchField.Input placeholder="Filter" />
                            <SearchField.ClearButton />
                        </SearchField.Group>
                    </SearchField>
                    <ToggleButtonGroup
                        aria-label="Which threads"
                        disallowEmptySelection
                        onSelectionChange={(keys) =>
                            setScope(keys.has('all') ? 'all' : 'following')
                        }
                        selectedKeys={[scope]}
                        selectionMode="single"
                        size="sm"
                    >
                        <ToggleButton id="following">Following</ToggleButton>
                        <ToggleButton id="all">
                            <ToggleButtonGroup.Separator />
                            All
                        </ToggleButton>
                    </ToggleButtonGroup>
                </PageBand.Controls>
            </PageBand>
            <div className="min-h-0 flex-1 overflow-y-auto pb-16 [scrollbar-gutter:stable]">
                <React.Suspense fallback={<div aria-busy="true" className="min-h-0 flex-1" />}>
                    <ThreadsPageContent filter={filter} scope={scope} />
                </React.Suspense>
            </div>
        </section>
    );
}
