import { type CloudAgentProvider, cloudAgentProviders } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import {
    type CloudAgentSettingsTarget,
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
 * The Server-wide model each Cloud Agent provider's launches use, one model
 * row (and its parameters) per provider. Owners and Admins pick them;
 * everyone else reads them.
 */
export function CloudAgentModelGroup({
    canManage,
    serverId,
}: {
    canManage: boolean;
    serverId: string;
}) {
    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Cloud Agents</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                {cloudAgentProviders.map((provider) => (
                    <CloudAgentProviderModelRows
                        canManage={canManage}
                        key={provider}
                        target={{ provider, serverId }}
                    />
                ))}
            </ItemCardGroup>
        </ItemCardGroup>
    );
}

function CloudAgentProviderModelRows({
    canManage,
    target,
}: {
    canManage: boolean;
    target: CloudAgentSettingsTarget;
}) {
    const settings = useCloudAgentSettings(target);
    if (!settings.data) {
        return (
            <ItemCard>
                <ItemCard.Content>
                    <ItemCard.Title>{modelTitle(target.provider)}</ItemCard.Title>
                    <SettingsRowError>{settings.error?.message}</SettingsRowError>
                </ItemCard.Content>
            </ItemCard>
        );
    }
    const view = cloudAgentModelView(settings.data);
    return (
        <>
            <CloudAgentModelRow canManage={canManage} target={target} view={view} />
            {view.params ? (
                <CloudAgentParamRows canManage={canManage} target={target} view={view.params} />
            ) : null}
        </>
    );
}

function CloudAgentModelRow({
    canManage,
    target,
    view,
}: {
    canManage: boolean;
    target: CloudAgentSettingsTarget;
    view: CloudAgentModelView;
}) {
    const setModel = useSetCloudAgentModel(target);
    const fallback = view.provider === 'claude' ? 'the account default' : 'Auto';

    return (
        <ItemCard>
            <ItemCard.Content>
                <SettingsRowTitle info={modelInfo(view)}>
                    {modelTitle(view.provider)}
                </SettingsRowTitle>
                {view.state === 'unavailable' ? (
                    <SettingsRowWarning>
                        Unavailable. Runs use {fallback} until you pick an available model.
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
                                setModel.mutate({ ...target, model });
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

function modelTitle(provider: CloudAgentProvider): string {
    return `${cloudAgentProviderName(provider)} model`;
}

/** What the Model row means, and how fresh the catalog behind its picker is. */
function modelInfo(view: CloudAgentModelView) {
    const name = cloudAgentProviderName(view.provider);
    if (view.catalogMissing) {
        return `Models appear once a Computer with ${name} connected reports them.`;
    }
    const about =
        view.provider === 'claude'
            ? 'Every Claude cloud agent on this Server uses this model. With Default, Claude uses your account’s default model.'
            : 'Every Cursor cloud agent on this Server uses this model. With Auto, Cursor picks a model for each run.';
    return view.refreshedAt
        ? `${about} Model list updated ${formatRelativeTime(view.refreshedAt)}.`
        : about;
}
