import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Separator } from '@heroui/react';
import { Fragment } from 'react';
import { SettingsPageColumn } from '../layout/settings-page-column.tsx';
import { SettingsPageHeader } from '../layout/settings-page-header.tsx';
import { SettingsRowTitle } from '../layout/settings-row-title.tsx';
import { SettingsFact } from '../layout/settings-text.tsx';

/**
 * How Captains and Workers sign their git work today (ADR 0060 decision 5).
 * Facts only: there is nothing to choose yet, so the page offers no controls.
 */
export function GitSettings() {
    return (
        <SettingsPageColumn>
            <SettingsPageHeader title="Git" />
            {gitSections.map((section) => (
                <ItemCardGroup key={section.title} variant="transparent">
                    <ItemCardGroup.Header>
                        <ItemCardGroup.Title>{section.title}</ItemCardGroup.Title>
                    </ItemCardGroup.Header>
                    <ItemCardGroup className="overflow-hidden">
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
                info: 'Captains commit, push and open pull requests as the Server’s Haus GitHub App.',
                title: 'Commit author',
                value: 'Haus bot',
            },
            {
                info: 'Each commit names the person whose message the Captain is acting on, so a shared channel never credits the wrong person.',
                title: 'Co-author',
                value: 'Whoever asked',
            },
            {
                info: 'Every Captain branch starts with this, then the Captain and the branch name.',
                mono: true,
                title: 'Branch prefix',
                value: 'haus/',
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
