import HausModels
@testable import HausUI
import Testing

/// Previews never run in the suite, so a fixture that drifts from the wire
/// shape would only surface as a crash in Xcode's canvas.
struct TaskPreviewFixturesTests {
    @Test func everyFixtureDecodes() {
        #expect(TaskPreviewFixtures.boards.map(\.key) == ["SEC", "GEN"])
        #expect(TaskPreviewFixtures.tasks.count == 5)
        #expect(TaskPreviewFixtures.detail.task.key == "SEC-12")
        #expect(TaskPreviewFixtures.detail.mentions.count == 2)
    }

    /// The board preview shows its one flag: Forge holds two active Tasks.
    @Test func theBoardFixtureCarriesAnOverloadedAgent() {
        let overloaded = BoardTaskGroups.overloadedAgents(TaskPreviewFixtures.tasks)

        #expect(overloaded.map(\.agentID) == ["agent_forge"])
    }
}
