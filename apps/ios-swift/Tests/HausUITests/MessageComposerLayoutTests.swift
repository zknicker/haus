@testable import HausUI
import XCTest

@MainActor
final class MessageComposerLayoutTests: XCTestCase {
    func testRestingComposerIsCompact() {
        XCTAssertFalse(expands(isFocused: false, fitsOneLine: true))
    }

    /// Focus alone keeps the one-line pill, as ChatGPT's composer does.
    func testFocusOnADraftThatFitsOneLineStaysCompact() {
        XCTAssertFalse(expands(isFocused: true, fitsOneLine: true))
    }

    func testADraftThatWrapsGrowsTheFocusedComposerIntoTheCard() {
        XCTAssertTrue(expands(isFocused: true, fitsOneLine: false))
    }

    /// Away from the keyboard a long draft rests in the pill again.
    func testAnUnfocusedLongDraftRestsCompact() {
        XCTAssertFalse(expands(isFocused: false, fitsOneLine: false))
    }

    func testAttachmentWorkKeepsComposerExpanded() {
        XCTAssertTrue(expands(isFocused: false, fitsOneLine: true, hasAttachments: true))
        XCTAssertTrue(expands(isFocused: false, fitsOneLine: true, isPreparingAttachment: true))
    }

    func testControlsRowHugsTheBottomEdgeAtEveryExpansion() {
        for totalHeight in [CGFloat(48), 61, 74] {
            XCTAssertEqual(
                ComposerControlLayout.controlsRowMinY(totalHeight: totalHeight, controlsHeight: 34),
                totalHeight - 34
            )
        }
    }

    func testSingleLineTextZoneStaysCloseToTheControlsRow() {
        let singleLine = ComposerControlLayout.expandedTopHeight(forFieldHeight: 22)

        XCTAssertEqual(singleLine, ComposerControlLayout.expandedFieldMinimumHeight)
        XCTAssertLessThanOrEqual(singleLine - 22, 6)
    }

    func testTallDraftGrowsTheTextZone() {
        XCTAssertEqual(ComposerControlLayout.expandedTopHeight(forFieldHeight: 96), 96)
    }

    func testExpandedTextIsInsetEquallyFromBothShellEdges() {
        let width: CGFloat = 300
        let fieldWidth = ComposerControlLayout.expandedFieldWidth(inWidth: width)
        let leadingInset = ComposerControlLayout.expandedFieldInset

        XCTAssertEqual(leadingInset, 10)
        XCTAssertEqual(width - (leadingInset + fieldWidth), leadingInset)
    }

    func testCollapsedPlaceholderClearsThePlusButton() {
        let width: CGFloat = 300
        let attachmentWidth: CGFloat = 36
        let sendWidth: CGFloat = 36
        let fieldWidth = ComposerControlLayout.compactFieldWidth(
            inWidth: width,
            attachmentWidth: attachmentWidth,
            sendWidth: sendWidth
        )
        let fieldOrigin = attachmentWidth + ComposerControlLayout.compactFieldGap

        XCTAssertEqual(ComposerControlLayout.compactFieldGap, 10)
        XCTAssertEqual(
            width - sendWidth - (fieldOrigin + fieldWidth),
            ComposerControlLayout.compactSendGap
        )
    }

    /// A composer taller than the menu is the case where the centring rule itself decides: the
    /// card's centre lands on the input's centre.
    func testSourceMenuCentersOnTheComposerInput() {
        let composer = CGRect(x: 12, y: 200, width: 376, height: 240)
        let padding = ComposerPortalGeometry.sourceMenuBottomPadding(
            composerFrame: composer,
            containerHeight: 540,
            menuHeight: 210
        )

        XCTAssertEqual(padding, 115)
        XCTAssertEqual(540 - padding - (210 / 2), composer.midY)
    }

    /// Keyboard up: the centred card may rest one key row past the composer's bottom, the way the
    /// reference's menu sits on the keys — the overlay window draws it above the keyboard.
    func testSourceMenuSinksIntoTheKeyboard() {
        let composer = CGRect(x: 12, y: 300, width: 376, height: 110)
        let padding = ComposerPortalGeometry.sourceMenuBottomPadding(
            composerFrame: composer,
            containerHeight: 540,
            menuHeight: 210
        )

        XCTAssertEqual(padding, 80)
        XCTAssertEqual(540 - padding, composer.midY + 105)
        XCTAssertGreaterThan(540 - padding, composer.maxY)
    }

    /// An ordinary composer is shorter than the menu, so with no keyboard holding the floor a
    /// centred card would run off the screen; it stops on the composer's bottom edge instead.
    func testSourceMenuNeverSinksBelowTheComposer() {
        let composer = CGRect(x: 12, y: 440, width: 376, height: 60)
        let padding = ComposerPortalGeometry.sourceMenuBottomPadding(
            composerFrame: composer,
            containerHeight: 540,
            menuHeight: 210
        )

        XCTAssertEqual(padding, 40)
        XCTAssertEqual(540 - padding, composer.maxY)
    }

    /// Keyboard down: the composer sits on the container floor and the card's bottom follows it
    /// there rather than hanging off the bottom of the screen.
    func testSourceMenuFollowsTheComposerToTheFloor() {
        let composer = CGRect(x: 12, y: 460, width: 376, height: 64)
        let padding = ComposerPortalGeometry.sourceMenuBottomPadding(
            composerFrame: composer,
            containerHeight: 540,
            menuHeight: 210
        )

        XCTAssertEqual(padding, 16)
        XCTAssertEqual(540 - padding, composer.maxY)
    }

    func testSourceMenuNeverLeavesTheTopOfTheScreen() {
        let padding = ComposerPortalGeometry.sourceMenuBottomPadding(
            composerFrame: CGRect(x: 12, y: 100, width: 376, height: 60),
            containerHeight: 540,
            menuHeight: 210
        )

        XCTAssertEqual(padding, 318)
        XCTAssertGreaterThanOrEqual(540 - padding - 210, ComposerPortalGeometry.nestingInset)
    }

    /// The card clips with one rounded rectangle whose radius the morph interpolates: the menu's
    /// fixed 30, and the media card's resolved concentric value. A concentric *shape* is banned
    /// here — it resolves against settled layout and left the corner square mid-morph.
    func testCardCornerTravelsBetweenMenuAndMediaRadii() {
        let size = CGSize(width: 400, height: 900)
        let menu = ComposerPortalGeometry(overlay: .sources, availableSize: size, composerFrame: nil)
        let media = ComposerPortalGeometry(overlay: .photos, availableSize: size, composerFrame: nil)

        XCTAssertEqual(menu.cornerRadius, 30)
        XCTAssertEqual(media.cornerRadius, ComposerPortalGeometry.mediaCornerRadius)
        XCTAssertGreaterThan(media.cornerRadius, menu.cornerRadius)
    }

    func testMenuPopsOutOfThePlusButton() {
        let box = ComposerPortalGeometry(
            overlay: .sources,
            availableSize: CGSize(width: 400, height: 900),
            composerFrame: CGRect(x: 12, y: 700, width: 376, height: 60)
        )
        let anchor = box.popAnchor

        // The plus sits 24pt in from the composer's leading edge, 24pt up from its bottom.
        XCTAssertEqual(anchor.x, (12 + 24 - box.origin.x) / box.width, accuracy: 0.0001)
        XCTAssertEqual(anchor.y, (760 - 24 - box.origin.y) / box.height, accuracy: 0.0001)
        // In the card's lower-leading region, where the button it came from actually is — the
        // card sinks one key row past the plus with a keyboard up, so the anchor rides above
        // the bottom edge rather than hugging the corner.
        XCTAssertLessThan(anchor.x, 0.2)
        XCTAssertGreaterThan(anchor.y, 0.5)
    }

    func testPopAnchorFallsBackToTheCardCornerWithoutAComposerFrame() {
        let box = ComposerPortalGeometry(
            overlay: .sources,
            availableSize: CGSize(width: 400, height: 900),
            composerFrame: nil
        )

        XCTAssertEqual(box.popAnchor, .bottomLeading)
    }

    func testLandingPhotoRevealsBeforeTheMorphEnds() {
        XCTAssertEqual(MorphingAttachmentImage.revealProgress(for: 0.3), 0)
        XCTAssertGreaterThan(MorphingAttachmentImage.revealProgress(for: 0.5), 0.3)
        XCTAssertEqual(MorphingAttachmentImage.revealProgress(for: 0.8), 1)
    }

    private func expands(
        isFocused: Bool,
        fitsOneLine: Bool,
        hasAttachments: Bool = false,
        isPreparingAttachment: Bool = false
    ) -> Bool {
        MessageComposerView.shouldExpand(
            isFocused: isFocused,
            draftFitsOneLine: fitsOneLine,
            hasAttachments: hasAttachments,
            isPreparingAttachment: isPreparingAttachment
        )
    }
}
