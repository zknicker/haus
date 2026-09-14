import { Button, Separator, Spinner, Tooltip } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { ArrowReloadHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Fragment, type ReactNode } from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import { SettingsRowError } from '../layout/settings-text.tsx';
import {
    connectionSetupDescription,
    type McpConnection,
    type McpConnectionTool,
} from './mcp-server-shared.ts';

/**
 * What this server exposes. The count belongs to the section title and the
 * refresh belongs to the section, so the rows stay a plain list of tool names.
 * While a refresh is in flight the header spinner is the only progress signal —
 * the list keeps the tools it already has rather than flashing a message.
 */
export function McpToolsGroup({
    connection,
    error,
    onRefresh,
    pending,
    tools,
}: {
    connection: McpConnection;
    error: string | null;
    onRefresh: () => void;
    pending: boolean;
    tools: McpConnectionTool[] | null;
}) {
    const rows = toolRows({ connection, error, pending, tools });

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header className="flex items-center justify-between gap-3">
                <ItemCardGroup.Title>
                    Tools
                    {tools && tools.length > 0 ? (
                        <span className="ms-2 text-muted tabular-nums">{tools.length}</span>
                    ) : null}
                </ItemCardGroup.Title>
                {pending ? (
                    <Spinner size="sm" />
                ) : (
                    <Tooltip delay={0}>
                        <Button
                            aria-label="Refresh tools"
                            isDisabled={!connection.connected}
                            isIconOnly
                            onPress={onRefresh}
                            size="sm"
                            variant="ghost"
                        >
                            <Icon icon={ArrowReloadHorizontalIcon} size={16} />
                        </Button>
                        <Tooltip.Content>Refresh tools</Tooltip.Content>
                    </Tooltip>
                )}
            </ItemCardGroup.Header>
            {/* Bounded: a server with thirty tools would otherwise bury Agent
                Access and Manage under a wall of rows. */}
            {rows ? (
                <ItemCardGroup className="max-h-72 overflow-y-auto">{rows}</ItemCardGroup>
            ) : null}
        </ItemCardGroup>
    );
}

function toolRows({
    connection,
    error,
    pending,
    tools,
}: {
    connection: McpConnection;
    error: string | null;
    pending: boolean;
    tools: McpConnectionTool[] | null;
}): ReactNode {
    if (!connection.connected) {
        return (
            <ToolMessage title="No tools yet">{connectionSetupDescription(connection)}</ToolMessage>
        );
    }
    if (error) {
        return (
            <ItemCard>
                <ItemCard.Content>
                    <ItemCard.Title>Couldn’t load tools</ItemCard.Title>
                    <SettingsRowError>{error}</SettingsRowError>
                </ItemCard.Content>
            </ItemCard>
        );
    }
    if (!tools || tools.length === 0) {
        // Nothing to report is a fact once loaded, and nothing at all while a
        // refresh is still running.
        return pending ? null : <ToolMessage title="No tools reported" />;
    }
    return tools.map((tool, index) => (
        <Fragment key={tool.name}>
            {index > 0 ? <Separator /> : null}
            <ItemCard>
                <ItemCard.Content>
                    <ItemCard.Title>{tool.title ?? tool.name}</ItemCard.Title>
                    {tool.description ? (
                        <ItemCard.Description>{tool.description}</ItemCard.Description>
                    ) : null}
                </ItemCard.Content>
            </ItemCard>
        </Fragment>
    ));
}

/** A state the list can report, shaped like the rows it replaces. */
function ToolMessage({ children, title }: { children?: ReactNode; title: string }) {
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>{title}</ItemCard.Title>
                {children ? (
                    <ItemCard.Description className="whitespace-normal">
                        {children}
                    </ItemCard.Description>
                ) : null}
            </ItemCard.Content>
        </ItemCard>
    );
}
