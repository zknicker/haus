import type { ComputerUseAccess, ComputerUseReadiness } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Alert, Label, ListBox, Select } from '@heroui/react';
import { CodeSnippet } from '../../components/code-snippet.tsx';
import { useSetComputerUseAccess } from '../../hooks/computer-use/use-computer-use-access.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { withSaveErrorToast } from '../../lib/saving-toast.ts';
import { SettingsFact } from '../settings/layout/settings-text.tsx';
import {
    agentDesktopInstallCommand,
    computerUseAccessOption,
    computerUseAccessOptions,
    computerUseReadinessIssues,
    computerUseReadinessText,
    isComputerUseAccess,
    supportsComputerUse,
} from './computer-use-model.ts';

export function ComputerUseAccessCard({
    computerId,
    serverId,
}: {
    computerId: string;
    serverId: string;
}) {
    const computers = useComputers(serverId);
    const computer = computers.data?.find((candidate) => candidate.id === computerId);
    if (!(computer && supportsComputerUse(computer))) {
        return null;
    }
    return (
        <section>
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>Access</ItemCardGroup.Title>
                </ItemCardGroup.Header>
                <ComputerUseReadinessWarning readiness={computer.reportedInventory?.computerUse} />
                <ItemCardGroup className="overflow-hidden">
                    <ComputerUseAccessRow
                        access={computer.computerUseAccess}
                        canChange={computer.canChangeComputerUse}
                        computerId={computerId}
                        serverId={serverId}
                    />
                </ItemCardGroup>
            </ItemCardGroup>
        </section>
    );
}

export function ComputerUseAccessRow({
    access,
    canChange,
    computerId,
    serverId,
}: {
    access: ComputerUseAccess;
    canChange: boolean;
    computerId: string;
    serverId: string;
}) {
    const setAccess = useSetComputerUseAccess(serverId);
    const current = computerUseAccessOption(access);
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>Computer use</ItemCard.Title>
                <ItemCard.Description>{current.description}</ItemCard.Description>
            </ItemCard.Content>
            <ItemCard.Action>
                {canChange ? (
                    <Select
                        aria-label="Computer use"
                        className="w-44"
                        onChange={(value) => {
                            if (isComputerUseAccess(value) && value !== access) {
                                withSaveErrorToast(() =>
                                    setAccess.mutateAsync({ access: value, computerId, serverId })
                                ).catch(() => undefined);
                            }
                        }}
                        value={access}
                        variant="secondary"
                    >
                        <Select.Trigger>
                            <Select.Value className="min-w-0 truncate" />
                            <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                            <ListBox>
                                {computerUseAccessOptions.map((option) => (
                                    <ListBox.Item
                                        id={option.id}
                                        key={option.id}
                                        textValue={option.label}
                                    >
                                        <Label>{option.label}</Label>
                                        <ListBox.ItemIndicator />
                                    </ListBox.Item>
                                ))}
                            </ListBox>
                        </Select.Popover>
                    </Select>
                ) : (
                    <SettingsFact>{current.label}</SettingsFact>
                )}
            </ItemCard.Action>
        </ItemCard>
    );
}

export function ComputerUseReadinessWarning({
    readiness,
}: {
    readiness: ComputerUseReadiness | undefined;
}) {
    const issues = computerUseReadinessIssues(readiness);
    if (issues.length === 0) {
        return null;
    }
    return (
        <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
                <Alert.Title>Computer use isn’t ready</Alert.Title>
                {issues.map((issue) => (
                    <Alert.Description key={issue.kind === 'install' ? issue.kind : issue.pane}>
                        {computerUseReadinessText(issue)}
                    </Alert.Description>
                ))}
                {issues.some((issue) => issue.kind === 'install') ? (
                    <CodeSnippet lines={agentDesktopInstallCommand} />
                ) : null}
            </Alert.Content>
        </Alert>
    );
}
