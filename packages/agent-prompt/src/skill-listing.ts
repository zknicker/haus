export interface SkillListingEntry {
    description: string;
    name: string;
}

export function renderSkillListing(skills: readonly SkillListingEntry[]) {
    if (skills.length === 0) {
        return '';
    }
    const rows = skills.map((skill) => `- ${skill.name}: ${skill.description}`).join('\n');
    return `## Skills

Your skills, by name and description. Before work one covers, open it with \`haus skill view <name>\` and follow it.

${rows}`;
}
