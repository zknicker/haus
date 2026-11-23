import Foundation
@testable import HausUI
import SwiftUI
import Testing

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// Inter in the four weights the app bundles: every weight lands on its
/// nearest face, a bold mark steps one face heavier, and where Inter is not
/// registered the system face stands in at the same size.
struct HausTypefaceTests {
    @Test func swiftUIWeightsLandOnTheBundledFaces() {
        #expect(HausTypeface(Font.Weight.light) == .regular)
        #expect(HausTypeface(Font.Weight.regular) == .regular)
        #expect(HausTypeface(Font.Weight.medium) == .medium)
        #expect(HausTypeface(Font.Weight.semibold) == .semibold)
        #expect(HausTypeface(Font.Weight.heavy) == .bold)
    }

    @Test func platformWeightsLandOnTheNearestFace() {
        #expect(HausTypeface(platformWeight: PlatformFont.Weight.regular.rawValue) == .regular)
        #expect(HausTypeface(platformWeight: PlatformFont.Weight.medium.rawValue) == .medium)
        #expect(HausTypeface(platformWeight: PlatformFont.Weight.semibold.rawValue) == .semibold)
        #expect(HausTypeface(platformWeight: PlatformFont.Weight.bold.rawValue) == .bold)
        #expect(HausTypeface(platformWeight: PlatformFont.Weight.black.rawValue) == .bold)
    }

    @Test func boldStepsOneFaceHeavier() {
        #expect(HausTypeface.regular.bolder == .semibold)
        #expect(HausTypeface.medium.bolder == .semibold)
        #expect(HausTypeface.semibold.bolder == .bold)
        #expect(HausTypeface.bold.bolder == .bold)
        #expect(HausTextRole.chip.boldTextWeight == .semibold)
    }

    @Test func theFacesNameTheBundledFiles() {
        #expect(HausTypeface.allCases.map(\.rawValue) == ["Inter-Regular", "Inter-Medium", "Inter-SemiBold", "Inter-Bold"])
    }

    @Test func aMissingFaceFallsBackToTheSystemAtTheSameSize() {
        let font = HausTypeface.semibold.platformFont(size: 17)
        #expect(font.pointSize == 17)
        if !HausTypeface.isRegistered {
            #expect(HausTypeface.face(of: font) == nil)
            #expect(HausTypeface.nearest(to: font) == .semibold)
        }
    }
}
