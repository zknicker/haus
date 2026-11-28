import CoreGraphics
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

    @Test func withTheFullListLeadingThePanesSplitWhatIsLeftEvenly() {
        let fold = Fold(direction: .vertical, span: 120...140, isActive: false)
        let size = CGSize(width: 591, height: 669)
        let panes = TaskModePanes.layout(size: size, fold: fold, isOpen: true, listIsFull: true)
        #expect(panes.conversation == CGRect(x: 0, y: 0, width: 295, height: 669))
        #expect(panes.task == CGRect(x: 295, y: 0, width: 296, height: 669))
        #expect(TaskModePanes.placements(size: size, fold: fold, isOpen: false, listIsFull: true).last == panes.task)
    }

    @Test func withTheFullListLeadingAFoldRunningAcrossStillStacksThePanes() {
        let fold = Fold(direction: .horizontal, span: 440...460, isActive: false)
        let panes = TaskModePanes.layout(size: CGSize(width: 263, height: 900), fold: fold, isOpen: true, listIsFull: true)
        #expect(panes.conversation == CGRect(x: 0, y: 0, width: 263, height: 450))
        #expect(panes.task == CGRect(x: 0, y: 450, width: 263, height: 450))
    }

    @Test func halfOpenLikeABookTheListStaysAsideSoThePanesMeetAtTheFold() {
        let halfOpen = Fold(direction: .vertical, span: 466...486, isActive: true)
        #expect(ListColumnLayout.pinsTaskModeAside(fold: halfOpen, width: 951, besideTask: true))
        #expect(!ListColumnLayout.pinsTaskModeAside(fold: halfOpen, width: 951, besideTask: false))
        #expect(!ListColumnLayout.pinsTaskModeAside(fold: Fold(direction: .vertical, span: 466...486, isActive: false), width: 951, besideTask: true))
        #expect(!ListColumnLayout.pinsTaskModeAside(fold: Fold(direction: .horizontal, span: 466...486, isActive: true), width: 669, besideTask: true))

        var mode = TaskModeColumn()
        #expect(mode.choose(.full, besideTask: true) == nil)
        #expect(mode.shown(.full, besideTask: true, hasRail: true, besideActiveFold: true) == .rail)
        #expect(mode.shown(.full, besideTask: true, hasRail: false, besideActiveFold: true) == .hidden)
        #expect(mode.shown(.rail, besideTask: true, hasRail: true, besideActiveFold: false) == .full)
    }

    @Test func withNoFoldThePanesSplitEvenlySideBySide() {
        let panes = TaskModePanes.layout(size: CGSize(width: 801, height: 600), fold: nil, isOpen: true)
        #expect(panes.conversation == CGRect(x: 0, y: 0, width: 400, height: 600))
        #expect(panes.task == CGRect(x: 400, y: 0, width: 401, height: 600))
    }

    @Test func fullyOpenThePanesMeetAtTheFoldsMidline() {
        let fold = Fold(direction: .vertical, span: 400...440, isActive: false)
        let panes = TaskModePanes.layout(size: CGSize(width: 900, height: 600), fold: fold, isOpen: true)
        #expect(panes.conversation == CGRect(x: 0, y: 0, width: 420, height: 600))
        #expect(panes.task == CGRect(x: 420, y: 0, width: 480, height: 600))
    }

    @Test func halfOpenLikeABookEachPaneKeepsClearOfTheFold() {
        let fold = Fold(direction: .vertical, span: 410...430, isActive: true)
        let panes = TaskModePanes.layout(size: CGSize(width: 900, height: 600), fold: fold, isOpen: true)
        #expect(panes.conversation == CGRect(x: 0, y: 0, width: 382, height: 600))
        #expect(panes.task == CGRect(x: 458, y: 0, width: 442, height: 600))
    }

    @Test func aFoldRunningAcrossStacksTheTaskBelowItsConversation() {
        let size = CGSize(width: 593, height: 900)
        let flat = TaskModePanes.layout(size: size, fold: Fold(direction: .horizontal, span: 440...460, isActive: false), isOpen: true)
        #expect(flat.conversation == CGRect(x: 0, y: 0, width: 593, height: 450))
        #expect(flat.task == CGRect(x: 0, y: 450, width: 593, height: 450))

        let halfOpen = TaskModePanes.layout(size: size, fold: Fold(direction: .horizontal, span: 440...460, isActive: true), isOpen: true)
        #expect(halfOpen.conversation == CGRect(x: 0, y: 0, width: 593, height: 412))
        #expect(halfOpen.task == CGRect(x: 0, y: 488, width: 593, height: 412))
    }

    @Test func theKeyboardShorteningTheColumnNeverGivesTheTaskANegativeHeight() {
        let fold = Fold(direction: .horizontal, span: 440...460, isActive: false)
        let panes = TaskModePanes.layout(size: CGSize(width: 593, height: 470), fold: fold, isOpen: true)
        #expect(panes.conversation.height == 450)
        #expect(panes.task?.height == 20)

        let covered = TaskModePanes.layout(size: CGSize(width: 593, height: 400), fold: fold, isOpen: true)
        #expect(covered.conversation == CGRect(x: 0, y: 0, width: 593, height: 400))
        #expect(covered.task?.height == 0)
    }

    @Test func aFoldOutsideTheColumnSplitsEvenly() {
        let size = CGSize(width: 600, height: 500)
        let before = TaskModePanes.layout(size: size, fold: Fold(direction: .vertical, span: -40...(-10), isActive: true), isOpen: true)
        #expect(before.conversation.width == 300)
        let after = TaskModePanes.layout(size: size, fold: Fold(direction: .vertical, span: 590...620, isActive: true), isOpen: true)
        #expect(after.conversation.width == 300)
    }

    @Test func aConversationAloneKeepsToTheLargerSideOfAnActiveFold() {
        let size = CGSize(width: 600, height: 500)
        let atLeadingEdge = TaskModePanes.layout(size: size, fold: Fold(direction: .vertical, span: 0...20, isActive: true), isOpen: false)
        #expect(atLeadingEdge.conversation == CGRect(x: 48, y: 0, width: 552, height: 500))
        #expect(atLeadingEdge.task == nil)

        let spanning = TaskModePanes.layout(size: size, fold: Fold(direction: .vertical, span: 400...420, isActive: true), isOpen: false)
        #expect(spanning.conversation == CGRect(x: 0, y: 0, width: 372, height: 500))
    }

    @Test func aConversationAloneIgnoresAnInactiveFoldAndOneRunningAcross() {
        let size = CGSize(width: 600, height: 500)
        let full = CGRect(origin: .zero, size: size)
        #expect(TaskModePanes.layout(size: size, fold: Fold(direction: .vertical, span: 0...20, isActive: false), isOpen: false).conversation == full)
        #expect(TaskModePanes.layout(size: size, fold: Fold(direction: .horizontal, span: 240...260, isActive: true), isOpen: false).conversation == full)
    }
}
