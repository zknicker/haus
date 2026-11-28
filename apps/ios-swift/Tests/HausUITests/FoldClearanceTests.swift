import CoreGraphics
import Testing
@testable import HausUI

struct FoldClearanceTests {
    private let book = Fold(direction: .vertical, span: 470...490, isActive: true)

    @Test func aRegionTallerThanWideIsABookFold() {
        let vertical = Fold(frame: CGRect(x: 470, y: 0, width: 20, height: 669), isActive: true)
        #expect(vertical == book)
        let across = Fold(frame: CGRect(x: 0, y: 465, width: 669, height: 20), isActive: false)
        #expect(across.direction == .horizontal)
        #expect(across.span == 465...485)
        #expect(across.midline == 475)
    }

    @Test func aControlKeepsToTheLargerSideOfAnActiveFold() {
        #expect(Fold.clearSide(of: 1100, avoiding: book) == 518...1100)
        #expect(Fold.clearSide(of: 600, avoiding: book) == 0...442)
        #expect(Fold.clearSide(of: 900, avoiding: nil) == 0...900)
        #expect(Fold.clearSide(of: 900, avoiding: Fold(direction: .vertical, span: 470...490, isActive: false)) == 0...900)
    }

    @Test func aFoldJustPastTheEdgeStillPushesControlsInside() {
        let justBefore = Fold(direction: .vertical, span: -20...(-5), isActive: true)
        #expect(Fold.clearSide(of: 400, avoiding: justBefore) == 23...400)
        let farAway = Fold(direction: .vertical, span: -80...(-40), isActive: true)
        #expect(Fold.clearSide(of: 400, avoiding: farAway) == 0...400)
    }

    @Test func halfOpenLikeABookTheFullListReachesTheFold() {
        #expect(ListColumnLayout.foldedWidth(fold: book, width: 887, besideTask: false) == 470)
        #expect(ListColumnLayout.foldedWidth(fold: book, width: 887, besideTask: true) == nil)
        #expect(ListColumnLayout.foldedWidth(fold: nil, width: 887, besideTask: false) == nil)
        let flat = Fold(direction: .vertical, span: 470...490, isActive: false)
        #expect(ListColumnLayout.foldedWidth(fold: flat, width: 887, besideTask: false) == nil)
        let across = Fold(direction: .horizontal, span: 470...490, isActive: true)
        #expect(ListColumnLayout.foldedWidth(fold: across, width: 669, besideTask: false) == nil)
        let narrow = Fold(direction: .vertical, span: 200...220, isActive: true)
        #expect(ListColumnLayout.foldedWidth(fold: narrow, width: 887, besideTask: false) == nil)
    }

    @Test func theListHandleKeepsOffAFoldRunningAcrossIt() {
        let across = Fold(direction: .horizontal, span: 440...460, isActive: true)
        #expect(ListColumnLayout.handleSpan(height: 900, fold: across) == 0...412)
        #expect(ListColumnLayout.handleSpan(height: 900, fold: book) == 0...900)
        #expect(ListColumnLayout.handleSpan(height: 900, fold: nil) == 0...900)
    }

    @Test func theRailsMarksStopAboveAFoldRunningAcrossIt() {
        let across = Fold(direction: .horizontal, span: 440...460, isActive: true)
        #expect(ListRailFold.gap(height: 900, fold: across) == 414)
        #expect(ListRailFold.gap(height: 900, fold: book) == 0)
        #expect(ListRailFold.gap(height: 900, fold: Fold(direction: .horizontal, span: 440...460, isActive: false)) == 0)
    }

    @Test func aScreenEndingAtTheFoldReachesNoneOfTheHomeIndicatorInset() {
        #expect(KeyboardInsetSample.bottomSafeArea(windowInset: 20, windowBottom: 951, viewBottom: 951) == 20)
        #expect(KeyboardInsetSample.bottomSafeArea(windowInset: 20, windowBottom: 951, viewBottom: 412) == 0)
        #expect(KeyboardInsetSample.bottomSafeArea(windowInset: 20, windowBottom: 951, viewBottom: 941) == 10)
        #expect(KeyboardInsetSample.inset(screenBottom: 412, keyboardTop: 620, bottomSafeArea: 0, isEditing: true) == 0)
    }

    @Test func theMentionCardStaysListWideBesideTheList() {
        #expect(MentionPickerLayout.maxCardWidth(isRegularWidth: true) == ListColumnLayout.fullIdealWidth)
        #expect(MentionPickerLayout.maxCardWidth(isRegularWidth: false) == .infinity)
    }
}
