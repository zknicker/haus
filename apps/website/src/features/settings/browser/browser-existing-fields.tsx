import type { AgentRuntimeBrowserConnection, AgentRuntimeBrowserSettings } from '@haus/api';
import { Separator } from '@heroui/react';
import { ItemCard } from '@heroui-pro/react';
import { SettingsFact } from '../layout/settings-text.tsx';
import { BrowserChoice } from './browser-choice.tsx';

export function BrowserExistingFields({
    connection,
    settings,
    isSaving,
    onChange,
}: {
    connection: AgentRuntimeBrowserConnection | null;
    settings: AgentRuntimeBrowserSettings;
    isSaving: boolean;
    onChange: (connection: AgentRuntimeBrowserConnection) => void;
}) {
    const selected = settings.browsers.find(
        (browser) =>
            browser.userDataDir === connection?.userDataDir &&
            browser.applicationPath === connection.applicationPath
    );
    const options = settings.browsers.map((browser) => ({
        id: JSON.stringify([browser.applicationPath, browser.userDataDir]),
        label: browser.name,
        description: `${browser.userDataDir} · ${browser.applicationPath} · ${browser.version ?? 'Unknown version'}${browser.available ? '' : ' · Unavailable'}`,
        disabled: !browser.available,
    }));
    const selectedId = connection
        ? JSON.stringify([connection.applicationPath, connection.userDataDir])
        : null;
    if (connection && selectedId && !selected) {
        options.push({
            id: selectedId,
            label: 'Saved browser (unavailable)',
            description: connection.userDataDir,
            disabled: true,
        });
    }
    return (
        <>
            <ItemCard>
                <ItemCard.Content>
                    <ItemCard.Title>Running browser</ItemCard.Title>
                </ItemCard.Content>
                <ItemCard.Action>
                    <BrowserChoice
                        isDisabled={isSaving}
                        label="Running browser"
                        onChange={(id) => {
                            const browser = settings.browsers.find(
                                (candidate) =>
                                    JSON.stringify([
                                        candidate.applicationPath,
                                        candidate.userDataDir,
                                    ]) === id
                            );
                            if (browser) {
                                onChange({
                                    applicationPath: browser.applicationPath,
                                    userDataDir: browser.userDataDir,
                                });
                            }
                        }}
                        options={options}
                        value={selectedId}
                    />
                </ItemCard.Action>
            </ItemCard>
            {connection ? (
                <>
                    <Separator />
                    <BrowserFact label="Chrome installation" value={connection.applicationPath} />
                    <Separator />
                    <BrowserFact label="Version" value={selected?.version ?? 'Unavailable'} />
                    <Separator />
                    <BrowserFact label="Profile" value={connection.userDataDir} />
                </>
            ) : null}
        </>
    );
}

function BrowserFact({ label, value }: { label: string; value: string }) {
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>{label}</ItemCard.Title>
            </ItemCard.Content>
            <ItemCard.Action className="w-64 min-w-0 max-w-full shrink">
                <SettingsFact className="block truncate text-right" title={value}>
                    {value}
                </SettingsFact>
            </ItemCard.Action>
        </ItemCard>
    );
}
