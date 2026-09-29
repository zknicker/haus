@testable import HausUI
import Testing

struct TaskAssigneeLabelTests {
    @Test func prefersTheResolvedActorName() {
        let item = TaskPreviewFixtures.items[0]
        let assignee = MessageAuthorPresentation(id: "agent_preview", name: "Blippy", avatarURL: nil)

        #expect(TaskAssigneeLabel.text(for: item, assignee: assignee) == "Blippy")
    }

    @Test func fallsBackToTheAgentIdSuffixWhenUnresolvable() {
        let item = TaskPreviewFixtures.items[0]

        #expect(item.task.assigneeAgentID == "agent_preview")
        #expect(TaskAssigneeLabel.text(for: item, assignee: nil) == "Agent review")
    }

    @Test func readsUnassignedWhenNoActorIsSet() {
        let item = TaskPreviewFixtures.items[2]

        #expect(TaskAssigneeLabel.text(for: item, assignee: nil) == "Unassigned")
    }
}
