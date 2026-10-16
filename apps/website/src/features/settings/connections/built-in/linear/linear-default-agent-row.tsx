import type { LinearWorkspace } from '@haus/api';
import { ListBox } from '@heroui/react';
import { InlineSelect, ItemCard } from '@heroui-pro/react';
import { useLinearSetDefaultAgent } from '../../../../../hooks/linear/use-linear-set-default-agent.ts';
import { SettingsRowTitle } from '../../../layout/settings-row-title.tsx';
import type { McpConnection } from '../../../mcp/mcp-server-shared.ts';

const noDefaultAgent = 'none';

/**
 * Which granted Agent answers the Haus app in Linear when no Agent label
 * names one. Only Agents with access can be chosen.
 */
export function LinearDefaultAgentRow({
    canManage,
    connection,
    serverId,
    workspace,
}: {
    canManage: boolean;
    connection: McpConnection;
    serverId: string;
    workspace: LinearWorkspace;
}) {
    const setDefault = useLinearSetDefaultAgent(serverId, connection.id);
    const options = [
        { id: noDefaultAgent, label: 'None' },
        ...connection.affectedAgents.map((agent) => ({ id: agent.id, label: agent.name })),
    ];

    return (
        <ItemCard>
            <ItemCard.Content>
                <SettingsRowTitle info="Answers when someone mentions or assigns the Haus app in Linear and no Agent label names an Agent.">
                    Default Agent
                </SettingsRowTitle>
            </ItemCard.Content>
            <ItemCard.Action>
                <InlineSelect
                    aria-label="Default Agent"
                    isDisabled={!canManage || setDefault.isPending}
                    onChange={(key) => {
                        if (typeof key === 'string') {
                            setDefault.setDefaultAgent(key === noDefaultAgent ? null : key);
                        }
                    }}
                    value={workspace.defaultAgentId ?? noDefaultAgent}
                >
                    <InlineSelect.Trigger>
                        <InlineSelect.Value />
                        <InlineSelect.Indicator />
                    </InlineSelect.Trigger>
                    <InlineSelect.Popover>
                        <ListBox items={options}>
                            {(option) => (
                                <ListBox.Item id={option.id} textValue={option.label}>
                                    {option.label}
                                    <ListBox.ItemIndicator />
                                </ListBox.Item>
                            )}
                        </ListBox>
                    </InlineSelect.Popover>
                </InlineSelect>
            </ItemCard.Action>
        </ItemCard>
    );
}
