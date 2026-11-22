import CoreGraphics
import SwiftUI
import Testing
@testable import HausUI

struct HausPaletteTests {
    @Test func accentIsHausBlueOnBothSchemes() {
        #expect(HausTone.accent.dark == HausSwatch(0x0485F7))
        #expect(HausTone.accent.light == HausSwatch(0x0485F7))
    }

    @Test func accentTextLightensOnDarkAndDeepensOnLight() {
        #expect(HausTone.accentInk.swatch(for: .dark) == HausSwatch(0x5AA9FA))
        #expect(HausTone.accentInk.swatch(for: .light) == HausSwatch(0x0473D6))
    }

    @Test func selectedChipInvertsAgainstTheCanvas() {
        #expect(HausTone.selectedFill.light == HausTone.ink.light)
        #expect(HausTone.selectedInk.dark == HausTone.canvas.dark)
        #expect(HausTone.selectedInk.light == HausSwatch(0xFFFFFF))
    }

    @Test func rulesAreTranslucentInkOfTheOppositeScheme() {
        #expect(HausTone.hairline.dark == HausSwatch(0xFFFFFF, opacity: 0.07))
        #expect(HausTone.hairline.light == HausSwatch(0x000000, opacity: 0.07))
    }

    @MainActor
    @Test(arguments: [ColorScheme.dark, .light])
    func toneColorsResolveToTheirSchemeSwatch(scheme: ColorScheme) {
        var environment = EnvironmentValues()
        environment.colorScheme = scheme
        for tone in [HausTone.canvas, .ink, .mutedInk, .accentInk, .hairline, .selectedFill] {
            let swatch = tone.swatch(for: scheme)
            let resolved = tone.color.resolve(in: environment)
            #expect(abs(Double(resolved.red) - swatch.red) < 0.004)
            #expect(abs(Double(resolved.green) - swatch.green) < 0.004)
            #expect(abs(Double(resolved.blue) - swatch.blue) < 0.004)
            #expect(abs(Double(resolved.opacity) - swatch.opacity) < 0.004)
        }
    }
}

struct FilterChipStyleTests {
    @Test func selectedChipInvertsAndDropsItsEdge() {
        let style = FilterChipStyle(isSelected: true)
        #expect(style.fill == .selectedFill)
        #expect(style.ink == .selectedInk)
        #expect(style.addGlyphInk == .selectedInk)
        #expect(style.edgeWidth == 0)
    }

    @Test func unselectedChipSitsOnTheFillWithAHairlineEdge() {
        let style = FilterChipStyle(isSelected: false)
        #expect(style.fill == .fill)
        #expect(style.ink == .ink)
        #expect(style.addGlyphInk == .faintInk)
        #expect(style.edgeWidth == 1)
    }
}

struct CaptainMarkGeometryTests {
    @Test(arguments: [16, 20, 24, 32, 48, 63, 96, 180] as [CGFloat])
    func cornerIsTheSameShareOfTheSideAtEverySize(side: CGFloat) {
        let geometry = CaptainMarkGeometry(side: side)
        #expect(abs(geometry.cornerRadius / side - 0.22) < 0.0001)
        #expect(geometry.cornerRadius == HausRadius.captain(side: side))
    }

    @Test func theTileSizeMatchesTheMock() {
        let tile = CaptainMarkGeometry(side: 63)
        #expect(abs(tile.cornerRadius - 13.86) < 0.001)
        #expect(abs(tile.badgeSide - 22) < 0.001)
        #expect(abs(tile.badgeCornerRadius - 9) < 0.001)
        #expect(abs(tile.badgeDot - 3) < 0.001)
        #expect(abs(tile.badgeDotGap - 2.5) < 0.001)
        #expect(abs(tile.unreadDiameter - 13) < 0.001)
        #expect(abs(tile.unreadRing - 3) < 0.001)
    }

    @Test func aHalfSizeMarkIsTheTileScaledByHalf() {
        let tile = CaptainMarkGeometry(side: 64)
        let half = CaptainMarkGeometry(side: 32)
        #expect(half.cornerRadius * 2 == tile.cornerRadius)
        #expect(half.badgeSide * 2 == tile.badgeSide)
        #expect(half.badgeDot * 2 == tile.badgeDot)
        #expect(half.unreadDiameter * 2 == tile.unreadDiameter)
        #expect(half.initialSize * 2 == tile.initialSize)
    }

    @Test(arguments: [16, 24, 63, 120] as [CGFloat])
    func theBadgeDotsFitInsideTheBadge(side: CGFloat) {
        let geometry = CaptainMarkGeometry(side: side)
        let grid = DotGrid.side(dot: geometry.badgeDot, gap: geometry.badgeDotGap)
        #expect(grid < geometry.badgeSide * 0.75)
        #expect(geometry.badgeSide < side / 2)
    }

    @Test func theMonogramIsTheNamesFirstLetterCapitalized() {
        #expect(CaptainMonogram.initial(of: "blippy") == "B")
        #expect(CaptainMonogram.initial(of: "  tiny") == "T")
        #expect(CaptainMonogram.initial(of: "Élan") == "É")
        #expect(CaptainMonogram.initial(of: " ") == "")
    }
}

struct DotGridTests {
    @Test func theWorkingBadgeHalvesEveryOtherDot() {
        let faded = (0..<9).map { DotGrid.opacity(at: $0, fadesAlternateDots: true) }
        #expect(faded == [1, 0.5, 1, 0.5, 1, 0.5, 1, 0.5, 1])
    }

    @Test func thePlainGlyphKeepsEveryDotSolid() {
        let solid = (0..<9).map { DotGrid.opacity(at: $0, fadesAlternateDots: false) }
        #expect(solid == Array(repeating: 1, count: 9))
    }

    @Test func theGridSpansThreeDotsAndTwoGaps() {
        #expect(DotGrid.side(dot: 3, gap: 2.5) == 14)
    }
}
