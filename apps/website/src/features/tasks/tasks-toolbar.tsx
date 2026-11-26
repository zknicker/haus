import { Label, ListBox, Toolbar } from '@heroui/react';
import { TaskStateDisc } from './task-state-disc.tsx';
import { taskStateLabels, taskStateOrder } from './task-state.ts';
import { AnyItem, ClearFiltersButton, FilterSelect, useSetFilter } from './tasks-filter-select.tsx';
import { isFiltered, type TasksPageFilters } from './tasks-page-model.ts';

export { ClearFiltersButton } from './tasks-filter-select.tsx';

export function TasksToolbar({ filters }: { filters: TasksPageFilters }) {
    const setFilter = useSetFilter();
    return (
        <Toolbar
            aria-label="Task filters"
            className="tasks-toolbar flex flex-wrap items-center gap-4"
        >
            <FilterSelect
                label="State"
                onChange={(next) => setFilter('state', next)}
                selected={filters.state ? taskStateLabels[filters.state] : 'Any'}
                value={filters.state}
            >
                <ListBox>
                    <AnyItem />
                    {taskStateOrder.map((state) => (
                        <ListBox.Item id={state} key={state} textValue={taskStateLabels[state]}>
                            <TaskStateDisc state={state} />
                            <Label>{taskStateLabels[state]}</Label>
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                    ))}
                </ListBox>
            </FilterSelect>
            {isFiltered(filters) ? <ClearFiltersButton /> : null}
        </Toolbar>
    );
}
