import { type CloudAgentProvider, cloudAgentProviders } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Separator } from '@heroui/react';
import { Fragment } from 'react';
import {
    type CloudAgentSettingsTarget,
    useCloudAgentSettings,
    useSetCloudAgentModel,
} from '../../../hooks/servers/use-cloud-agent-settings.ts';
import { cloudAgentProviderName } from '../../workers/cloud-agent-provider-presentation.ts';
import { SettingsFact, SettingsRowError } from '../layout/settings-text.tsx';
import { CloudAgentModelPicker } from './cloud-agent-model-picker.tsx';
import {
    type CloudAgentModelView,
    cloudAgentModelView,
    modelSettingForKey,
} from './cloud-agent-model.ts';
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
                <ItemCardGroup.Title>Workers</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup>
                {cloudAgentProviders.map((provider, index) => (
                    <Fragment key={provider}>
                        {index > 0 ? <Separator /> : null}
                        <CloudAgentProviderModelRows
                            canManage={canManage}
                            target={{ provider, serverId }}
                        />
                    </Fragment>
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

    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>{modelTitle(view.provider)}</ItemCard.Title>
                <ItemCard.Description className="whitespace-normal">
                    {modelDescription(view)}
                </ItemCard.Description>
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
                    <SettingsFact>{view.selectedLabel}</SettingsFact>
                )}
            </ItemCard.Action>
        </ItemCard>
    );
}

function modelTitle(provider: CloudAgentProvider): string {
    return `${cloudAgentProviderName(provider)} model`;
}

function modelDescription(view: CloudAgentModelView) {
    if (view.state === 'unavailable') {
        const fallback = view.provider === 'claude' ? 'the account default' : 'Auto';
        return `Unavailable. Runs use ${fallback} until you pick an available model.`;
    }
    if (view.catalogMissing) {
        return 'No models reported yet.';
    }
    return `The model every ${cloudAgentProviderName(view.provider)} Cloud Worker uses.`;
}
