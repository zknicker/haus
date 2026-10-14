import type { CloudAgentProvider } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import {
    useCloudAgentSettings,
    useSetCloudAgentModel,
} from '../../../hooks/servers/use-cloud-agent-settings.ts';
import { formatRelativeTime } from '../../../lib/format.ts';
import { cloudAgentProviderName } from '../../cloud-agents/cloud-agent-provider-presentation.ts';
import { SettingsRowTitle } from '../layout/settings-row-title.tsx';
import { SettingsFact, SettingsRowError, SettingsRowWarning } from '../layout/settings-text.tsx';
import {
    type CloudAgentModelView,
    cloudAgentModelView,
    modelSettingForKey,
} from './cloud-agent-model.ts';
import { CloudAgentModelPicker } from './cloud-agent-model-picker.tsx';
import { CloudAgentParamRows } from './cloud-agent-param-rows.tsx';

/**
 * The Server-wide model every Cursor Cloud Agent launch uses. Owners and
 * Admins pick it; everyone else reads it.
 */
export function CloudAgentModelGroup(props: { canManage: boolean; serverId: string }) {
    return (
        <>
            <ProviderCloudAgentModelGroup {...props} provider="cursor" />
            <ProviderCloudAgentModelGroup {...props} provider="claude" />
        </>
    );
}

function ProviderCloudAgentModelGroup({
    canManage,
    serverId,
    provider,
}: {
    canManage: boolean;
    serverId: string;
    provider: CloudAgentProvider;
}) {
    const settings = useCloudAgentSettings(serverId, provider);

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>
                    {cloudAgentProviderName(provider)} Cloud Agents
                </ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                {settings.data ? (
                    <CloudAgentModelRows
                        canManage={canManage}
                        provider={provider}
                        serverId={serverId}
                        view={cloudAgentModelView(settings.data)}
                    />
                ) : (
                    <ItemCard>
                        <ItemCard.Content>
                            <ItemCard.Title>Model</ItemCard.Title>
                            <SettingsRowError>{settings.error?.message}</SettingsRowError>
                        </ItemCard.Content>
                    </ItemCard>
                )}
            </ItemCardGroup>
        </ItemCardGroup>
    );
}

function CloudAgentModelRows({
    canManage,
    serverId,
    provider,
    view,
}: {
    canManage: boolean;
    serverId: string;
    provider: CloudAgentProvider;
    view: CloudAgentModelView;
}) {
    return (
        <>
            <CloudAgentModelRow
                canManage={canManage}
                provider={provider}
                serverId={serverId}
                view={view}
            />
            {view.params ? (
                <CloudAgentParamRows
                    canManage={canManage}
                    provider={provider}
                    serverId={serverId}
                    view={view.params}
                />
            ) : null}
        </>
    );
}

function CloudAgentModelRow({
    canManage,
    serverId,
    provider,
    view,
}: {
    canManage: boolean;
    serverId: string;
    provider: CloudAgentProvider;
    view: CloudAgentModelView;
}) {
    const setModel = useSetCloudAgentModel(serverId, provider);

    return (
        <ItemCard>
            <ItemCard.Content>
                <SettingsRowTitle info={modelInfo(view, provider)}>Model</SettingsRowTitle>
                {view.state === 'unavailable' ? (
                    <SettingsRowWarning>
                        Unavailable. Runs use Auto until you pick an available model.
                    </SettingsRowWarning>
                ) : null}
                <SettingsRowError>{setModel.error?.message}</SettingsRowError>
            </ItemCard.Content>
            <ItemCard.Action>
                {canManage ? (
                    <CloudAgentModelPicker
                        onPick={(key) => {
                            const model = modelSettingForKey(key, view);
                            if (model) {
                                setModel.mutate({ model, provider, serverId });
                            }
                        }}
                        view={view}
                    />
                ) : (
                    <SettingsFact
                        className={view.state === 'unavailable' ? 'text-warning' : undefined}
                    >
                        {view.selectedLabel}
                    </SettingsFact>
                )}
            </ItemCard.Action>
        </ItemCard>
    );
}

/** What the Model row means, and how fresh the catalog behind its picker is. */
function modelInfo(view: CloudAgentModelView, provider: CloudAgentProvider) {
    if (view.catalogMissing) {
        return `Models appear once a Computer with ${cloudAgentProviderName(provider)} connected reports them.`;
    }
    const about = `Every ${cloudAgentProviderName(provider)} Cloud Agent on this Server uses this model. With Auto, ${cloudAgentProviderName(provider)} picks a model for each run.`;
    return view.refreshedAt
        ? `${about} Model list updated ${formatRelativeTime(view.refreshedAt)}.`
        : about;
}
