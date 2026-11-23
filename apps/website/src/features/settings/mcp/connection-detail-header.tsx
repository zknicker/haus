import { Button, Dropdown, Label } from '@heroui/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import { PageTopbar } from '../../shell/shell-topbar.tsx';
import { SettingsPageHeader } from '../layout/settings-page-header.tsx';
import { SettingsInfo } from '../layout/settings-row-title.tsx';
import { ConnectionGlyph } from './connection-mark.tsx';
import type { McpConnection } from './mcp-server-shared.ts';

/**
 * The connection page's identity: its mark, then the settings page title with
 * the server's own words about itself behind an info button. The page's
 * overflow menu rides in the shell band, as a Device page's does; finishing
 * setup belongs to the Connected account section.
 */
export function ConnectionDetailHeader({
    connection,
    onRemove,
}: {
    connection: McpConnection;
    onRemove: () => void;
}) {
    return (
        <div className="flex flex-col gap-5">
            <PageTopbar>
                <ConnectionBandMenu name={connection.name} onRemove={onRemove} />
            </PageTopbar>
            <span className="connection-hero-mark">
                <ConnectionGlyph connection={connection} />
            </span>
            <SettingsPageHeader
                info={
                    connection.summary ? (
                        <SettingsInfo label={`About ${connection.name}`}>
                            {connection.summary}
                        </SettingsInfo>
                    ) : null
                }
                title={connection.name}
            />
        </div>
    );
}

function ConnectionBandMenu({ name, onRemove }: { name: string; onRemove: () => void }) {
    return (
        <Dropdown>
            <Button aria-label={`${name} actions`} isIconOnly size="sm" variant="ghost">
                <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu>
                    <Dropdown.Item
                        id="remove"
                        onAction={onRemove}
                        textValue="Remove from Haus"
                        variant="danger"
                    >
                        <Label>Remove from Haus</Label>
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
