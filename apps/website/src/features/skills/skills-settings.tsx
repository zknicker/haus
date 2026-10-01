import { Button, Tooltip } from '@heroui/react';
import { EmptyState } from '@heroui-pro/react';
import { InformationCircleIcon } from '@hugeicons-pro/core-stroke-rounded';
import { useState } from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { SettingsPageHeader } from '../settings/layout/settings-page-header.tsx';
import { PageColumn } from '../shell/page-column.tsx';
import { buildHostSkillSections, type HostSkill } from './host-skill-catalog.ts';
import { HostSkillDialog } from './host-skill-dialog.tsx';
import { HostSkillSection } from './host-skill-section.tsx';

/** Settings → Skills: browse the skills installed on this Server's Computers. */
export function SkillsSettings({ serverId }: { serverId: string }) {
    const computers = useComputers(serverId);
    const agents = useAgents(serverId);
    const [selected, setSelected] = useState<HostSkill | null>(null);
    const sections = buildHostSkillSections(computers.data ?? []);
    const skillAgents = new Map(
        (agents.data ?? []).map((agent) => [
            agent.id,
            { avatarUrl: agent.avatarUrl, name: agent.displayName },
        ])
    );

    return (
        <PageColumn>
            {/* The info control rides the description, not the title, so the
                page heading's accessible name stays exactly "Skills". */}
            <SettingsPageHeader
                description={
                    <span className="inline-flex items-center gap-1">
                        Skills installed on your Computers.
                        <SkillsInfo />
                    </span>
                }
                title="Skills"
            />
            {computers.error && !computers.data ? (
                <SkillsMessage
                    description="Haus couldn’t load the Computer skill inventory. Try opening this page again."
                    title="Skills unavailable"
                />
            ) : computers.data ? (
                sections.length > 0 ? (
                    sections.map((section) => (
                        <HostSkillSection
                            key={section.id}
                            onSelect={setSelected}
                            section={section}
                        />
                    ))
                ) : (
                    <SkillsMessage
                        description="Skills installed on a Computer appear here once it reports them."
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
        </PageColumn>
    );
}

function SkillsInfo() {
    return (
        <Tooltip delay={0}>
            <Button aria-label="About Skills" isIconOnly size="sm" variant="ghost">
                <Icon aria-hidden="true" icon={InformationCircleIcon} size={16} />
            </Button>
            <Tooltip.Content>
                To give an Agent one of these skills, add it from the Agent’s Profile.
            </Tooltip.Content>
        </Tooltip>
    );
}

function SkillsMessage({ description, title }: { description: string; title: string }) {
    return (
        <EmptyState>
            <EmptyState.Header>
                <EmptyState.Title>{title}</EmptyState.Title>
                <EmptyState.Description>{description}</EmptyState.Description>
            </EmptyState.Header>
        </EmptyState>
    );
}
