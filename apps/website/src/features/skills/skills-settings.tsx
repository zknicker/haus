import { SearchField } from '@heroui/react';
import { useState } from 'react';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { SettingsEmptyState } from '../settings/layout/settings-empty.tsx';
import { SettingsPageColumn } from '../settings/layout/settings-page-column.tsx';
import { SettingsPageHeader } from '../settings/layout/settings-page-header.tsx';
import {
    buildHostSkillSections,
    filterHostSkillSections,
    type HostSkill,
} from './host-skill-catalog.ts';
import { HostSkillDialog } from './host-skill-dialog.tsx';
import { HostSkillSection } from './host-skill-section.tsx';

/** Settings → Skills: browse the skills installed on this Server's Computers. */
export function SkillsSettings({ serverId }: { serverId: string }) {
    const computers = useComputers(serverId);
    const agents = useAgents(serverId);
    const [selected, setSelected] = useState<HostSkill | null>(null);
    const [query, setQuery] = useState('');
    const installed = buildHostSkillSections(computers.data ?? []);
    const sections = filterHostSkillSections(installed, query);
    const skillAgents = new Map(
        (agents.data ?? []).map((agent) => [
            agent.id,
            { avatarUrl: agent.avatarUrl, name: agent.displayName },
        ])
    );

    return (
        <SettingsPageColumn width="table">
            <SettingsPageHeader title="Skills" />
            {installed.length > 0 ? (
                <SearchField
                    aria-label="Search skills"
                    className="w-64 max-w-full"
                    onChange={setQuery}
                    value={query}
                >
                    <SearchField.Group>
                        <SearchField.SearchIcon />
                        <SearchField.Input placeholder="Search skills" />
                        <SearchField.ClearButton />
                    </SearchField.Group>
                </SearchField>
            ) : null}
            {computers.error && !computers.data ? (
                <SettingsEmptyState
                    description="Haus couldn’t load the device skill inventory. Try opening this page again."
                    title="Skills unavailable"
                />
            ) : computers.data ? (
                sections.length > 0 ? (
                    sections.map((section) => (
                        <HostSkillSection
                            isFiltered={query.trim().length > 0}
                            key={section.id}
                            onSelect={setSelected}
                            section={section}
                        />
                    ))
                ) : installed.length > 0 ? (
                    <SettingsEmptyState role="status" title="No skills match your search" />
                ) : (
                    <SettingsEmptyState
                        description="Skills installed on a device appear here once it reports them."
                        title="No skills installed"
                    />
                )
            ) : (
                // Blank while the inventory loads: no skeleton, no flash of empty.
                <div aria-busy="true" className="min-h-32">
                    <span className="sr-only">Loading Skills</span>
                </div>
            )}
            <HostSkillDialog
                agents={skillAgents}
                entry={selected}
                onClose={() => setSelected(null)}
                serverId={serverId}
            />
        </SettingsPageColumn>
    );
}
