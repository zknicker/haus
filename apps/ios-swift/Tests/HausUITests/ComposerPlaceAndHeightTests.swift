import CoreGraphics
@testable import HausUI
import Testing

struct ComposerPlaceAndHeightTests {
    @Test func placeholderFollowsThePlace() {
        #expect(ComposerPlace.captain.placeholder == "Reply")
        #expect(ComposerPlace.task.placeholder == "Reply")
        #expect(ComposerPlace.project(name: "product").placeholder == "Message #product")
        #expect(ComposerPlace.person(name: "Zach").placeholder == "Message Zach")
    }

    @Test func sendCircleIsAccentOnlyWhenSendable() {
        #expect(ComposerCircleStyle.send(canSend: true).fill == .accent)
        #expect(ComposerCircleStyle.send(canSend: false).fill == .strongFill)
        #expect(ComposerCircleStyle.send(canSend: false).ink == .mutedInk)
        #expect(ComposerCircleStyle.plus(isEnabled: true).fill == .strongFill)
    }

    @Test func pullingTheGrabberUpPastTheSettleDistanceGoesFullHeight() {
        #expect(ComposerDraftHeight.card.settled(predictedTranslation: -120) == .full)
        #expect(ComposerDraftHeight.card.settled(predictedTranslation: -30) == .card)
        #expect(ComposerDraftHeight.card.settled(predictedTranslation: 200) == .card)
    }

    @Test func pushingAFullDraftDownReturnsToTheCard() {
        #expect(ComposerDraftHeight.full.settled(predictedTranslation: 120) == .card)
        #expect(ComposerDraftHeight.full.settled(predictedTranslation: 30) == .full)
        #expect(ComposerDraftHeight.full.settled(predictedTranslation: -200) == .full)
    }

    @MainActor @Test func leavingTheScreenSettlesAFullDraftBackToTheCard() {
        let interaction = ComposerInteraction()
        interaction.draftHeight = .full

        interaction.resetPresentation()

        #expect(interaction.draftHeight == .card)
    }

    @Test func dragFloorTracksTheFinger() {
        #expect(ComposerDraftHeight.dragFloor(startHeight: 120, translation: -80) == 200)
        #expect(ComposerDraftHeight.dragFloor(startHeight: 120, translation: 40) == 80)
        #expect(ComposerDraftHeight.dragFloor(startHeight: 120, translation: 400) == 0)
    }

    @Test func expandedHeightStaysAtTheDraftWithoutDragOrFill() {
        #expect(ComposerControlLayout.expandedHeight(natural: 90, floor: 0, offered: 700, fills: false) == 90)
    }

    @Test func expandedHeightFollowsADragFloorUpToTheOfferedHeight() {
        #expect(ComposerControlLayout.expandedHeight(natural: 90, floor: 300, offered: 700, fills: false) == 300)
        #expect(ComposerControlLayout.expandedHeight(natural: 90, floor: 900, offered: 700, fills: false) == 700)
        #expect(ComposerControlLayout.expandedHeight(natural: 90, floor: 40, offered: 700, fills: false) == 90)
    }

    @Test func fullHeightTakesEverythingOffered() {
        #expect(ComposerControlLayout.expandedHeight(natural: 90, floor: 0, offered: 700, fills: true) == 700)
        #expect(ComposerControlLayout.expandedHeight(natural: 90, floor: 0, offered: nil, fills: true) == 90)
        #expect(ComposerControlLayout.expandedHeight(natural: 800, floor: 0, offered: 700, fills: true) == 800)
    }
}
