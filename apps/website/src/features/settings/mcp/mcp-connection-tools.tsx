import { Button, Chip, Spinner } from '@heroui/react';
import { ItemCard } from '@heroui-pro/react';
import { useState } from 'react';
import { ConnectionSection } from './connection-section.tsx';
import { connectionSetupDescription, type McpConnection } from './mcp-server-shared.ts';

/** About two wrapped lines of names at the page's reading width. */
const collapsedToolCount = 8;

/**
 * What this server exposes — reference material, so it sits below the
 * actionable cards and starts collapsed. Haus Server reports tool names only,
 * so each tool is one small chip. The list grows inline when expanded; only
 * the page ever scrolls. While a refresh runs, the spinner beside the
 * title is the only progress signal and the list keeps what it has.
 */
export function McpToolsSection({
    connection,
    pending,
    tools,
}: {
    connection: McpConnection;
    pending: boolean;
    tools: readonly string[];
}) {
    const [expanded, setExpanded] = useState(false);
    const collapsible = tools.length > collapsedToolCount;
    const shown = expanded || !collapsible ? tools : tools.slice(0, collapsedToolCount);

    return (
        <ConnectionSection
            count={connection.connected ? tools.length : undefined}
            title="Tools"
            trailing={pending ? <Spinner className="ms-2 align-middle" size="sm" /> : null}
        >
            {connection.connected && tools.length > 0 ? (
                <>
                    <ul aria-label="Tools" className="flex flex-wrap gap-1.5">
                        {shown.map((name) => (
                            <li key={name}>
                                <Chip size="sm" variant="soft">
                                    {name}
                                </Chip>
                            </li>
                        ))}
                    </ul>
                    {collapsible ? (
                        <Button
                            className="self-start"
                            onPress={() => setExpanded((value) => !value)}
                            size="sm"
                            variant="ghost"
                        >
                            {expanded ? 'Show less' : `Show all ${tools.length}`}
                        </Button>
                    ) : null}
                </>
            ) : (
                <ToolMessage connection={connection} pending={pending} />
            )}
        </ConnectionSection>
    );
}

function ToolMessage({ connection, pending }: { connection: McpConnection; pending: boolean }) {
    // Nothing to report is a fact once loaded, and nothing at all while a
    // refresh is still running.
    if (connection.connected && pending) {
        return null;
    }
    return (
        <ItemCard variant="transparent">
            <ItemCard.Content>
                <ItemCard.Description className="whitespace-normal">
                    {connection.connected
                        ? 'No tools reported.'
                        : connectionSetupDescription(connection)}
                </ItemCard.Description>
            </ItemCard.Content>
        </ItemCard>
    );
}
