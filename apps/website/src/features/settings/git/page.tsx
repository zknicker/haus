import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Separator } from '@heroui/react';
import { Fragment } from 'react';
import { SettingsPageColumn } from '../layout/settings-page-column.tsx';
import { SettingsPageHeader } from '../layout/settings-page-header.tsx';
import { SettingsRowTitle } from '../layout/settings-row-title.tsx';
import { SettingsFact } from '../layout/settings-text.tsx';
import { ReposLinkRow } from '../repos/repos-link-row.tsx';

export function GitSettings() {
    return (
        <SettingsPageColumn>
            <SettingsPageHeader title="Git" />
            {gitSections.map((section) => (
                <ItemCardGroup key={section.title} variant="transparent">
                    <ItemCardGroup.Header>
                        <ItemCardGroup.Title>{section.title}</ItemCardGroup.Title>
                    </ItemCardGroup.Header>
                    <ItemCardGroup>
                        {section.facts.map((fact, index) => (
                            <Fragment key={fact.title}>
                                {index > 0 ? <Separator /> : null}
                                <ItemCard>
                                    <ItemCard.Content>
                                        <SettingsRowTitle info={fact.info}>
                                            {fact.title}
                                        </SettingsRowTitle>
                                    </ItemCard.Content>
                                    <ItemCard.Action>
                                        <SettingsFact
                                            className={fact.mono ? 'font-mono' : undefined}
                                        >
                                            {fact.value}
                                        </SettingsFact>
                                    </ItemCard.Action>
                                </ItemCard>
                            </Fragment>
                        ))}
                    </ItemCardGroup>
                </ItemCardGroup>
            ))}
            <ReposLinkRow />
        </SettingsPageColumn>
    );
}

const gitSections: ReadonlyArray<{
    facts: ReadonlyArray<{ info: string; mono?: boolean; title: string; value: string }>;
    title: string;
}> = [
    {
        facts: [
            {
                info: 'A Captain checks out a repo as a git worktree on its own branch: haus/<captain>/<repo>.',
                mono: true,
                title: 'Branch prefix',
                value: 'haus/',
            },
            {
                info: 'Captains commit as the Haus GitHub App’s bot, with whoever asked as co-author.',
                title: 'Commit author',
                value: 'Haus bot, requester co-author',
            },
            {
                info: 'Captains push their branches and open pull requests through the Haus GitHub App, which needs access to the repo.',
                title: 'Pushes and pull requests',
                value: 'Haus GitHub App',
            },
        ],
        title: 'Captains',
    },
    {
        facts: [
            {
                info: 'Workers commit and push with the git login already on the device they run on.',
                title: 'Commit author',
                value: 'The device’s git login',
            },
        ],
        title: 'Workers',
    },
];
