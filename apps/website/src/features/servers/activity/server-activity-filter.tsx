import { Button, Dropdown, Label } from '@heroui/react';
import { ArrowDown01Icon } from '@hugeicons-pro/core-stroke-rounded';
import type { Key } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import type { ActivityLogAgent } from '../../members/agent-profile/agent-activity-log-entries.ts';

const agentsParam = 'agents';

/**
 * The Activity page's Agent filter, kept in the URL (`?agents=a,b`) so a
 * narrowed view survives reload and can be linked. Ids no longer listed are
 * ignored; none selected means every Agent.
 */
export function useActivityAgentFilter(agents: readonly ActivityLogAgent[]) {
    const [searchParams, setSearchParams] = useSearchParams();
    const listed = new Set(agents.map((agent) => agent.id));
    const selected = (searchParams.get(agentsParam) ?? '')
        .split(',')
        .filter((id) => listed.has(id));
    const select = (agentIds: readonly string[]) =>
        setSearchParams(
            (params) => {
                const next = new URLSearchParams(params);
                if (agentIds.length === 0 || agentIds.length === agents.length) {
                    next.delete(agentsParam);
                } else {
                    next.set(agentsParam, agentIds.join(','));
                }
                return next;
            },
            { replace: true }
        );
    return { select, selected };
}

/** A stock multi-select menu of the Server's Agents, for the log's day bar. */
export function ActivityAgentFilter({
    agents,
    onSelectionChange,
    selected,
}: {
    agents: readonly ActivityLogAgent[];
    onSelectionChange: (agentIds: string[]) => void;
    selected: readonly string[];
}) {
    const label =
        selected.length === 0
            ? 'All Agents'
            : selected.length === 1
              ? (agents.find((agent) => agent.id === selected[0])?.displayName ?? '1 Agent')
              : `${selected.length} Agents`;
    return (
        <Dropdown>
            <Button aria-label={`Filter by Agent: ${label}`} size="sm" variant="ghost">
                {label}
                <Icon aria-hidden="true" icon={ArrowDown01Icon} size={16} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu
                    aria-label="Agents"
                    onSelectionChange={(keys) =>
                        onSelectionChange(keys === 'all' ? [] : readAgentIds(keys, agents))
                    }
                    selectedKeys={new Set(selected)}
                    selectionMode="multiple"
                >
                    {agents.map((agent) => (
                        <Dropdown.Item id={agent.id} key={agent.id} textValue={agent.displayName}>
                            <EntityAvatar
                                name={agent.displayName}
                                size={16}
                                src={agent.avatarUrl}
                            />
                            <Label>{agent.displayName}</Label>
                            <Dropdown.ItemIndicator />
                        </Dropdown.Item>
                    ))}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}

/** In the Agents' own order, so the URL reads the same however they were picked. */
function readAgentIds(keys: Set<Key>, agents: readonly ActivityLogAgent[]): string[] {
    return agents.filter((agent) => keys.has(agent.id)).map((agent) => agent.id);
}
