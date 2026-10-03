import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import {
    useCloudAgentSettings,
    useSetCloudAgentModel,
} from '../../../hooks/servers/use-cloud-agent-settings.ts';
import { formatRelativeTime } from '../../../lib/format.ts';
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
export function CloudAgentModelGroup({
    canManage,
    serverId,
}: {
    canManage: boolean;
    serverId: string;
}) {
    const settings = useCloudAgentSettings(serverId);

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Cloud Agents</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                {settings.data ? (
                    <CloudAgentModelRows
                        canManage={canManage}
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
    view,
}: {
    canManage: boolean;
    serverId: string;
    view: CloudAgentModelView;
}) {
    return (
        <>
            <CloudAgentModelRow canManage={canManage} serverId={serverId} view={view} />
            {view.params ? (
                <CloudAgentParamRows canManage={canManage} serverId={serverId} view={view.params} />
            ) : null}
        </>
    );
}

function CloudAgentModelRow({
    canManage,
    serverId,
    view,
}: {
    canManage: boolean;
    serverId: string;
    view: CloudAgentModelView;
}) {
    const setModel = useSetCloudAgentModel(serverId);

    return (
        <ItemCard>
            <ItemCard.Content>
                <SettingsRowTitle info={modelInfo(view)}>Model</SettingsRowTitle>
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
                                setModel.mutate({ model, serverId });
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
function modelInfo(view: CloudAgentModelView) {
    if (view.catalogMissing) {
        return 'Models appear once a Computer with Cursor connected reports them.';
    }
    const about =
        'Every Cloud Agent on this Server uses this model. With Auto, Cursor picks a model for each run.';
    return view.refreshedAt
        ? `${about} Model list updated ${formatRelativeTime(view.refreshedAt)}.`
        : about;
}
