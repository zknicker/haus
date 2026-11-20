import type { HomeProjectOption } from './agent-creation-contract.ts';
import { InventorySelect } from './inventory-select.tsx';

export function HomeProjectSelect({
    onChange,
    projects,
    value,
}: {
    onChange: (projectId: string) => void;
    projects: readonly HomeProjectOption[];
    value: string;
}) {
    const empty = projects.length === 0;
    return (
        <InventorySelect
            description={empty ? 'Create a project first. A Captain lives in one.' : undefined}
            disabled={empty}
            label="Home project"
            onChange={onChange}
            options={projects}
            placeholder={empty ? 'No projects yet' : 'Select a project'}
            value={value}
        />
    );
}
