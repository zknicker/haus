import type { Agent, AgentSkillImportRecord, AgentSkillMetadata, ImportableSkill } from '@haus/api';
import * as React from 'react';
import { useSkillImport } from '../../../hooks/members/use-skill-import.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { SkillDialog } from './skill-dialog.tsx';
import { SkillList } from './skill-list.tsx';

export function AgentSkills({
    agent,
    canEdit,
    imports,
    server,
    skillSources,
    skills,
}: {
    agent: Agent;
    canEdit: boolean;
    imports: AgentSkillImportRecord[];
    server: ServerDetail;
    skillSources: ImportableSkill[];
    skills: AgentSkillMetadata[];
}) {
    const [selectedSkill, setSelectedSkill] = React.useState<AgentSkillMetadata | null>(null);
    const importSkill = useSkillImport(server.id, agent.id);

    return (
        <>
            <SkillList
                addableSkills={selectAddableSkills(skillSources, skills)}
                canEdit={canEdit}
                importError={importSkill.error?.message ?? null}
                importPending={importSkill.isPending}
                imports={selectOutstandingImports(imports, agent.id)}
                onImport={importSkill.importSkill}
                onSelectSkill={setSelectedSkill}
                skillSources={skillSources}
                skills={skills}
            />
            <SkillDialog
                agent={agent}
                onOpenChange={(open) => {
                    if (!open) {
                        setSelectedSkill(null);
                    }
                }}
                server={server}
                skill={selectedSkill}
            />
        </>
    );
}

export function selectAddableSkills(sources: ImportableSkill[], owned: AgentSkillMetadata[]) {
    const ownedNames = new Set(owned.map((skill) => skill.name));
    return sources.filter((source) => !ownedNames.has(source.name));
}

export function selectOutstandingImports(records: AgentSkillImportRecord[], agentId: string) {
    const latestBySource = new Map<string, AgentSkillImportRecord>();
    for (const record of records) {
        if (record.agentId !== agentId || latestBySource.has(record.sourceId)) {
            continue;
        }
        latestBySource.set(record.sourceId, record);
    }
    return [...latestBySource.values()].filter((record) => record.status !== 'applied');
}
