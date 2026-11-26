import { ListBox, Toolbar } from '@heroui/react';
import { useProjects } from '../../hooks/projects/use-projects.ts';
import { useTaskLabels } from '../../hooks/servers/use-task-labels.ts';
import { useServerContext } from '../servers/server-context.ts';
import {
    issueActorFromKey,
    unassignedKey,
    useIssueActor,
    useIssueAssigneeChoices,
} from './issue-actor.ts';
import {
    AnyItem,
    ClearFiltersButton,
    FilterSelect,
    useSetSearchParam,
} from './issue-filter-select.tsx';
import { LabelListBox, PersonItems, PlainItem } from './issue-list-boxes.tsx';
import { issueFilterNames, isFiltered, type IssuesPageFilters } from './issues-page-model.ts';

export function IssuesToolbar({ filters }: { filters: IssuesPageFilters }) {
    const setParam = useSetSearchParam();
    return (
        <Toolbar
            aria-label="Issue filters"
            className="tasks-toolbar flex flex-wrap items-center gap-4"
        >
            <ProjectFilter onChange={(next) => setParam('project', next)} value={filters.project} />
            {filters.view === 'assigned' ? null : (
                <AssigneeFilter
                    onChange={(next) => setParam('assignee', next)}
                    value={filters.assignee}
                />
            )}
            <LabelFilter onChange={(next) => setParam('label', next)} value={filters.label} />
            {isFiltered(filters) ? <ClearFiltersButton names={issueFilterNames} /> : null}
        </Toolbar>
    );
}

interface FilterProps {
    onChange: (next: null | string) => void;
    value: null | string;
}

function ProjectFilter({ onChange, value }: FilterProps) {
    const { server } = useServerContext();
    const projects = useProjects(server.id).data ?? [];
    return (
        <FilterSelect
            label="Project"
            onChange={onChange}
            selected={projects.find((project) => project.chatId === value)?.name ?? 'Any'}
            value={value}
        >
            <ListBox>
                <AnyItem />
                {projects.map((project) => (
                    <PlainItem id={project.chatId} key={project.chatId} label={project.name} />
                ))}
            </ListBox>
        </FilterSelect>
    );
}

function AssigneeFilter({ onChange, value }: FilterProps) {
    const { server } = useServerContext();
    const people = useIssueAssigneeChoices(server.id);
    const current = useIssueActor(server.id, value ? issueActorFromKey(value) : null);
    const selected = value === unassignedKey ? 'Unassigned' : (current?.label ?? 'Any');
    return (
        <FilterSelect label="Assignee" onChange={onChange} selected={selected} value={value}>
            <ListBox>
                <AnyItem />
                <PlainItem id={unassignedKey} label="Unassigned" />
                <PersonItems people={people} />
            </ListBox>
        </FilterSelect>
    );
}

function LabelFilter({ onChange, value }: FilterProps) {
    const { server } = useServerContext();
    const labels = useTaskLabels(server.id).data ?? [];
    if (labels.length === 0 && value === null) {
        return null;
    }
    return (
        <FilterSelect
            label="Label"
            onChange={onChange}
            selected={labels.find((label) => label.id === value)?.name ?? 'Any'}
            value={value}
        >
            <LabelListBox labels={labels}>
                <AnyItem />
            </LabelListBox>
        </FilterSelect>
    );
}
