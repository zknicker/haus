import HausModels
import Testing
@testable import HausUI

struct TaskModeLayoutTests {
    @Test func openingATaskStepsTheColumnAsideAndClosingRestoresIt() {
        var mode = TaskModeColumn()
        #expect(mode.shown(.full, besideTask: false, hasRail: true) == .full)
        #expect(mode.shown(.full, besideTask: true, hasRail: true) == .rail)
        #expect(mode.shown(.hidden, besideTask: true, hasRail: true) == .rail)
        #expect(mode.shown(.full, besideTask: true, hasRail: false) == .hidden)

        mode.taskClosed()
        #expect(mode.shown(.full, besideTask: false, hasRail: true) == .full)
    }

    @Test func aDragBesideATaskMovesOnlyThatTasksColumn() {
        var mode = TaskModeColumn()
        #expect(mode.choose(.full, besideTask: true) == nil)
        #expect(mode.shown(.hidden, besideTask: true, hasRail: true) == .full)

        mode.taskClosed()
        #expect(mode.shown(.hidden, besideTask: false, hasRail: true) == .hidden)
        #expect(mode.shown(.hidden, besideTask: true, hasRail: true) == .rail)
        #expect(mode.choose(.rail, besideTask: false) == .rail)
    }

    @Test func fullyOpenThePanesSplitEvenly() {
        let panes = TaskModePanes.layout(width: 801, fold: nil)
        #expect(panes.conversationWidth == 400)
        #expect(panes.taskWidth == 401)
        #expect(panes.foldWidth == 0)
        #expect(panes.clearance == 0)
    }

    @Test func halfOpenThePanesMeetAtTheFoldAndKeepClearOfIt() {
        let panes = TaskModePanes.layout(width: 900, fold: 410...430)
        #expect(panes.conversationWidth == 410)
        #expect(panes.foldWidth == 20)
        #expect(panes.taskWidth == 470)
        #expect(panes.clearance == TaskModePanes.foldClearance)
    }

    @Test func aFoldOutsideTheColumnSplitsEvenly() {
        #expect(TaskModePanes.layout(width: 600, fold: -40...(-10)).clearance == 0)
        #expect(TaskModePanes.layout(width: 600, fold: 590...620).conversationWidth == 300)
    }
}
