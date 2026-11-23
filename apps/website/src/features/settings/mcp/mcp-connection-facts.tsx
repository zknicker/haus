import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Separator } from '@heroui/react';
import { SettingsFact } from '../layout/settings-text.tsx';
import { ConnectionSection } from './connection-section.tsx';
import type { McpConnection } from './mcp-server-shared.ts';

/**
 * What the Server records about a custom connection that the header does not
 * already say, as settings fact rows. Built-in connections have no such
 * section; their address and sign-in are Haus's, not the reader's.
 */
export function McpConnectionFacts({ connection }: { connection: McpConnection }) {
    return (
        <ConnectionSection title="Information">
            <ItemCardGroup>
                <ItemCard>
                    <ItemCard.Content>
                        <ItemCard.Title>Server</ItemCard.Title>
                    </ItemCard.Content>
                    {/* The address is the one long value: it takes the room the
                        title leaves and truncates there, whole on hover. */}
                    <ItemCard.Action className="min-w-0 shrink">
                        <SettingsFact className="block truncate font-mono" title={connection.url}>
                            {connection.url}
                        </SettingsFact>
                    </ItemCard.Action>
                </ItemCard>
                <Separator />
                <ItemCard>
                    <ItemCard.Content>
                        <ItemCard.Title>Sign-in</ItemCard.Title>
                    </ItemCard.Content>
                    <ItemCard.Action>
                        <SettingsFact>{signInLabels[connection.auth]}</SettingsFact>
                    </ItemCard.Action>
                </ItemCard>
            </ItemCardGroup>
        </ConnectionSection>
    );
}

const signInLabels: Record<McpConnection['auth'], string> = {
    headers: 'Headers',
    none: 'None',
    oauth: 'OAuth',
};
