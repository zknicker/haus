import { Tabs } from '@heroui/react';
import { ActivationStep } from '../../components/activation/activation-shell.tsx';
import type { ServerDetail } from '../../lib/haus-server.tsx';
import { ComputerSetupCommands } from '../computers/computer-setup-commands.tsx';
import {
    type CoveOnboardingView,
    type CoveStatusLine,
    coveComputerPlatforms,
} from './cove-onboarding-model.ts';
import { StatusLineList, SwitchServerButton } from './cove-step-parts.tsx';

export function CoveComputerStep({
    failure,
    onSwitchServer,
    serverSlug,
    serverName,
    view,
}: {
    failure: ServerDetail['onboarding']['failure'];
    onSwitchServer: () => void;
    serverSlug: string;
    serverName: string;
    view: Exclude<CoveOnboardingView, 'app' | 'meet-cove'>;
}) {
    return (
        <ActivationStep
            description={`Connect a Computer to run the Agents in ${serverName}.`}
            footer={<SwitchServerButton onPress={onSwitchServer} />}
            title="Connect a Computer"
        >
            <div className="grid min-w-0 gap-4">
                <Tabs className="min-w-0" defaultSelectedKey="macos" variant="secondary">
                    <Tabs.ListContainer>
                        <Tabs.List aria-label="Computer platform">
                            {coveComputerPlatforms.map((platform) => (
                                <Tabs.Tab
                                    id={platform.id}
                                    isDisabled={!platform.isAvailable}
                                    key={platform.id}
                                >
                                    {platform.label}
                                    <Tabs.Indicator />
                                </Tabs.Tab>
                            ))}
                        </Tabs.List>
                    </Tabs.ListContainer>
                    <Tabs.Panel className="grid min-w-0 gap-4 pt-4" id="macos">
                        <p className="text-base text-muted sm:text-sm">
                            Run these commands on the Mac you want to connect. Already installed
                            Haus Computer? Skip to Setup.
                        </p>
                        <ComputerSetupCommands serverSlug={serverSlug} />
                    </Tabs.Panel>
                </Tabs>
                <StatusLineList lines={statusLines(view, failure)} />
            </div>
        </ActivationStep>
    );
}

function statusLines(
    view: Exclude<CoveOnboardingView, 'app' | 'meet-cove'>,
    failure: ServerDetail['onboarding']['failure']
): CoveStatusLine[] {
    if (view === 'connect-failed' && failure) {
        return [{ label: failure.detail, tone: 'failed' }];
    }
    if (view === 'detecting-runtimes') {
        return [
            { label: 'Request approved.', tone: 'done' },
            { label: 'Computer connected.', tone: 'done' },
            { label: 'Detecting runtimes…', tone: 'waiting' },
        ];
    }
    return [];
}
