import type { Project } from '@haus/api';
import { ItemCardGroup } from '@heroui-pro/react';
import { Button, SearchField, Separator } from '@heroui/react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjects } from '../../../hooks/projects/use-projects.ts';
import { matchesProjectSearch } from '../../../lib/project-homes.ts';
import { useServerContext } from '../../servers/server-context.ts';
import { settingsProjectRoute } from '../../servers/server-routes.ts';
import { NewProjectDialog } from '../../shell/new-project-dialog.tsx';
import { SettingsEmptyRow } from '../layout/settings-empty.tsx';
import { SettingsPageColumn } from '../layout/settings-page-column.tsx';
import { SettingsPageHeader } from '../layout/settings-page-header.tsx';
import { ArchivedProjectsSection } from './archived-projects-section.tsx';
import { ProjectRow } from './project-row.tsx';

export function ProjectsPage() {
    const { server } = useServerContext();
    const navigate = useNavigate();
    const projects = useProjects(server.id);
    const [query, setQuery] = React.useState('');
    const [creating, setCreating] = React.useState(false);
    const matching = (projects.data ?? []).filter(
        (project) =>
            !project.isHaus &&
            (matchesProjectSearch(project.name, query) || matchesProjectSearch(project.key, query))
    );
    const active = matching.filter((project) => !project.archived);
    const archived = matching.filter((project) => project.archived);

    return (
        <SettingsPageColumn width="table">
            <SettingsPageHeader title="Projects" />
            <div className="flex items-center justify-between gap-3">
                <SearchField
                    aria-label="Search projects"
                    className="w-56 max-w-full"
                    onChange={setQuery}
                    value={query}
                >
                    <SearchField.Group>
                        <SearchField.SearchIcon />
                        <SearchField.Input placeholder="Search projects" />
                        <SearchField.ClearButton />
                    </SearchField.Group>
                </SearchField>
                <Button onPress={() => setCreating(true)} size="sm" variant="secondary">
                    New project
                </Button>
            </div>
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>
                        Active
                        {projects.data ? (
                            <span className="text-muted ms-2 tabular-nums">{active.length}</span>
                        ) : null}
                    </ItemCardGroup.Title>
                </ItemCardGroup.Header>
                {projects.error && !projects.data ? (
                    <p className="text-danger text-sm" role="alert">
                        Couldn’t load projects. Try opening this page again.
                    </p>
                ) : projects.data === undefined ? (
                    <div aria-busy="true" className="min-h-24">
                        <span className="sr-only">Loading projects</span>
                    </div>
                ) : (
                    <ItemCardGroup>
                        {active.length === 0 ? (
                            <SettingsEmptyRow>
                                {query ? 'No projects match your search.' : 'No projects yet.'}
                            </SettingsEmptyRow>
                        ) : (
                            <ProjectRows projects={active} slug={server.slug} />
                        )}
                    </ItemCardGroup>
                )}
            </ItemCardGroup>
            <ArchivedProjectsSection
                canRestore={server.role === 'owner' || server.role === 'admin'}
                projects={archived}
                serverId={server.id}
            />
            <NewProjectDialog
                onClose={() => setCreating(false)}
                onCreated={(chatId) => navigate(settingsProjectRoute(server.slug, chatId))}
                open={creating}
                serverId={server.id}
            />
        </SettingsPageColumn>
    );
}

function ProjectRows({ projects, slug }: { projects: readonly Project[]; slug: string }) {
    return projects.map((project, index) => (
        <React.Fragment key={project.chatId}>
            {index > 0 ? <Separator /> : null}
            <ProjectRow project={project} slug={slug} />
        </React.Fragment>
    ));
}
