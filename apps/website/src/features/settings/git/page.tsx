import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Separator } from '@heroui/react';
import { Fragment } from 'react';
import { SettingsPageColumn } from '../layout/settings-page-column.tsx';
import { SettingsPageHeader } from '../layout/settings-page-header.tsx';
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
                                        <ItemCard.Title>{fact.title}</ItemCard.Title>
                                        {fact.description ? (
                                            <ItemCard.Description className="whitespace-normal">
                                                {fact.description}
                                            </ItemCard.Description>
                                        ) : null}
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
    facts: ReadonlyArray<{ description?: string; mono?: boolean; title: string; value: string }>;
    title: string;
}> = [
    {
        facts: [
            {
                description: 'Each Captain works on its own branch under this prefix.',
                mono: true,
                title: 'Branch prefix',
                value: 'haus/',
            },
            {
                title: 'Commit author',
                value: 'Haus bot, requester co-author',
            },
            {
                description: 'The app needs access to each repo a Captain pushes to.',
                title: 'Pushes and pull requests',
                value: 'Haus GitHub App',
            },
        ],
        title: 'Captains',
    },
    {
        facts: [
            {
                title: 'Commit author',
                value: 'The device’s git login',
            },
        ],
        title: 'Workers',
    },
];
