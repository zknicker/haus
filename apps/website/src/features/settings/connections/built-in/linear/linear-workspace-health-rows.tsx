import type { LinearWorkspace } from '@haus/api';
import { Button, Chip, Separator } from '@heroui/react';
import { ItemCard } from '@heroui-pro/react';
import { SettingsRowTitle } from '../../../layout/settings-row-title.tsx';
import { SettingsFact } from '../../../layout/settings-text.tsx';
import {
    linearApplicationsSettingsUrl,
    linearTeamSettingsWarning,
    linearWorkspaceHealth,
} from './linear-workspace-health.ts';

/**
 * The workspace card's fact rows. The teams the Haus app was granted are
 * where Agents can write, so the row says that. A workspace admin changes
 * that grant on the Haus app's page in Linear's settings, so its one control
 * opens Linear's installed applications; Linear's `PermissionChange` delivery
 * then refreshes the row. Team settings writes need membership, so while the
 * Haus app is not a member of some of its teams a Team settings row names
 * them with the same control. The last delivery shows only while it is worth a look.
 */
export function LinearWorkspaceHealthRows({
    canManage,
    workspace,
}: {
    canManage: boolean;
    workspace: LinearWorkspace;
}) {
    const health = linearWorkspaceHealth(workspace);
    const teams = workspace.teams.map((team) => team.name || team.key).join(', ');
    const changeInLinear = canManage ? (
        <Button
            onPress={() =>
                window.open(
                    linearApplicationsSettingsUrl(workspace.urlKey),
                    '_blank',
                    'noopener,noreferrer'
                )
            }
            size="sm"
            variant="ghost"
        >
            Change in Linear
        </Button>
    ) : null;

    return (
        <>
            <ItemCard>
                <ItemCard.Content>
                    <ItemCard.Title>Agents can work in</ItemCard.Title>
                    {health.teamAccess === 'ok' ? (
                        <ItemCard.Description className="max-w-full truncate" title={teams}>
                            {teams}
                        </ItemCard.Description>
                    ) : null}
                </ItemCard.Content>
                <ItemCard.Action className="flex items-center gap-2">
                    {health.teamAccess === 'none' ? (
                        <Chip color="warning" size="sm" variant="soft">
                            <Chip.Label>No teams — Agents can't write</Chip.Label>
                        </Chip>
                    ) : null}
                    {changeInLinear}
                </ItemCard.Action>
            </ItemCard>
            {health.missingMemberTeams.length > 0 ? (
                <>
                    <Separator />
                    <ItemCard>
                        <ItemCard.Content>
                            <SettingsRowTitle info="Agents can work on issues in these teams but can't change their statuses or labels until a workspace admin grants Haus specific teams in Linear.">
                                Team settings
                            </SettingsRowTitle>
                        </ItemCard.Content>
                        <ItemCard.Action className="flex items-center gap-2">
                            <Chip color="warning" size="sm" variant="soft">
                                <Chip.Label>
                                    {linearTeamSettingsWarning(
                                        health.missingMemberTeams,
                                        workspace.teams
                                    )}
                                </Chip.Label>
                            </Chip>
                            {changeInLinear}
                        </ItemCard.Action>
                    </ItemCard>
                </>
            ) : null}
            {health.lastDelivery ? (
                <>
                    <Separator />
                    <ItemCard>
                        <ItemCard.Content>
                            <SettingsRowTitle info="If this stopped updating, open the app's webhook settings in Linear and re-enable it.">
                                Last delivery
                            </SettingsRowTitle>
                        </ItemCard.Content>
                        <ItemCard.Action>
                            <SettingsFact className="tabular-nums">
                                {health.lastDelivery}
                            </SettingsFact>
                        </ItemCard.Action>
                    </ItemCard>
                </>
            ) : null}
        </>
    );
}
