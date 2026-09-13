import HausModels
@testable import HausUI
import Testing

/// What a focused task asks of the lens it lands in.
struct TaskFocusTests {
    /// The sidebar's own Tasks row names no task, so nothing widens.
    @Test func leavesTheLensAloneWithoutAFocus() {
        #expect(!TaskFocusLens.widens(focus: nil, defaultLens: TaskPreviewFixtures.items))
    }

    /// A tracked task is already on screen; opening the background tier for it
    /// would show the reader rows they did not ask for.
    @Test func leavesTheLensAloneForATaskTheDefaultLensHolds() {
        let focus = TaskFocus(messageID: "message_task_2")

        #expect(!TaskFocusLens.widens(focus: focus, defaultLens: TaskPreviewFixtures.items))
    }

    /// The default lens hides the background tier, so a background-tier focus
    /// would land on a list that does not contain it. The route opens the lens.
    @Test func widensForABackgroundTierFocus() {
        let background = TaskPreviewFixtures.backgroundItems[0]
        #expect(background.task.tier == .background)
        #expect(!TaskPreviewFixtures.items.contains { $0.id == background.id })

        #expect(
            TaskFocusLens.widens(
                focus: TaskFocus(messageID: background.id),
                defaultLens: TaskPreviewFixtures.items
            )
        )
    }

    /// Nil is "not loaded yet", not "absent": widening on a lens that has not
    /// landed would reload the screen for a question nobody has answered.
    @Test func waitsForTheLensToLandBeforeWidening() {
        #expect(!TaskFocusLens.widens(focus: TaskFocus(messageID: "message_task_4"), defaultLens: nil))
    }
}
