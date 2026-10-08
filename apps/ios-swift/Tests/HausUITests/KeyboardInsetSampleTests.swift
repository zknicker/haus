@testable import HausUI
import CoreGraphics
import Testing

struct KeyboardInsetSampleTests {
    private let screenBottom: CGFloat = 874
    private let homeIndicator: CGFloat = 34

    @Test func aRaisedKeyboardReachesFromTheScreenBottomToItsTopEdge() {
        let inset = KeyboardInsetSample.inset(
            screenBottom: screenBottom,
            keyboardTop: 539,
            bottomSafeArea: homeIndicator,
            isEditing: true
        )
        #expect(inset == 335)
    }

    @Test func aHiddenKeyboardReadsAsTheHomeIndicatorInset() {
        let belowScreen = KeyboardInsetSample.inset(
            screenBottom: screenBottom,
            keyboardTop: 874,
            bottomSafeArea: homeIndicator,
            isEditing: true
        )
        #expect(belowScreen == homeIndicator)
    }

    /// After a cancelled back swipe out of a Thread, UIKit kept reporting a 233-point keyboard that
    /// was not on screen; with nothing editing, no keyboard frame may lift the composer.
    @Test func aKeyboardFrameWithNothingEditingIsIgnored() {
        let inset = KeyboardInsetSample.inset(
            screenBottom: screenBottom,
            keyboardTop: 641,
            bottomSafeArea: homeIndicator,
            isEditing: false
        )
        #expect(inset == homeIndicator)
    }

    @Test func subpointGuideFramesRoundToWholePoints() {
        let inset = KeyboardInsetSample.inset(
            screenBottom: screenBottom,
            keyboardTop: 539.4,
            bottomSafeArea: homeIndicator,
            isEditing: true
        )
        #expect(inset == 335)
    }

    @Test func changesInsideAnAnimationBlockOrAnnouncedWindowAreAnimated() {
        #expect(KeyboardInsetSample.isAnimated(inheritedAnimationDuration: 0.38, now: 10, announcedAnimationEnd: 0))
        #expect(KeyboardInsetSample.isAnimated(inheritedAnimationDuration: 0, now: 10, announcedAnimationEnd: 10.3))
    }

    /// Interactive dismissal posts no notification while the finger moves: those frames must lay
    /// out with no animation, or the composer trails the keyboard.
    @Test func framesAFingerDrivesAreTrackedWithoutAnimation() {
        #expect(!KeyboardInsetSample.isAnimated(inheritedAnimationDuration: 0, now: 10, announcedAnimationEnd: 9.9))
        #expect(KeyboardInsetSample(inset: 200, isAnimated: false).animation == nil)
        #expect(KeyboardInsetSample(inset: 335, isAnimated: true).animation != nil)
    }
}
