/** Generic for every skill; event input, never the standing prompt. */
export function managedSkillChangeText(names: readonly string[]) {
    return `[Haus skill update: these Haus skills were updated: ${names.join(', ')}.] Re-read each before you next use it, and rebuild any scripts, notes, memory, or recipes you derived from it. If that changed something you rely on, post one short note in #all saying what you updated; otherwise do not post.`;
}
