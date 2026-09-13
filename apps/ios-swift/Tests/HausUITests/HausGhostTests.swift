@testable import HausUI
import CoreGraphics
import SwiftUI
import XCTest

/// What the ported mark has to keep being: the App's exact silhouette, the
/// App's exact colors, and a drift that only ever moves on its shared grid.
final class HausGhostPathTests: XCTestCase {
    func testTheBodyFillsItsViewBox() {
        let bounds = HausGhostPaths.body.boundingRect

        // The App's own trace, measured off `BODY_PATH`: a few units of margin
        // inside the 192x204 box on every side. A parser that dropped a
        // relative chain lands far outside this.
        XCTAssertEqual(bounds.minX, 3.72, accuracy: 0.05)
        XCTAssertEqual(bounds.maxX, 188.31, accuracy: 0.05)
        XCTAssertEqual(bounds.minY, 4.22, accuracy: 0.05)
        XCTAssertEqual(bounds.maxY, 199.54, accuracy: 0.05)
        XCTAssertTrue(
            CGRect(x: 0, y: 0, width: HausGhostPaths.viewBoxWidth, height: HausGhostPaths.viewBoxHeight)
                .contains(bounds)
        )
    }

    func testTheEyesSitInsideTheBody() {
        let eyes = HausGhostPaths.eyes
        let body = HausGhostPaths.body

        // The eyes are opaque marks on the glass, and the solid fill punches
        // them out as holes; either way an eye that escaped the silhouette
        // would read as a smear beside the mark.
        XCTAssertTrue(body.boundingRect.contains(eyes.boundingRect))
        for corner in corners(of: eyes.boundingRect) {
            XCTAssertTrue(body.contains(corner), "\(corner) fell outside the body")
        }
    }

    func testTheSilhouetteIsTheBodyAndBothEyes() {
        // One path, so an even-odd fill leaves holes rather than painting the
        // eyes over the body.
        XCTAssertEqual(
            HausGhostPaths.silhouette.boundingRect,
            HausGhostPaths.body.boundingRect
        )
        XCTAssertFalse(
            HausGhostPaths.silhouette.contains(
                CGPoint(x: 102, y: 76),
                eoFill: true
            ),
            "the left eye should be a hole in the even-odd fill"
        )
    }

    func testTheDrawnWidthFollowsTheViewBoxAspect() {
        XCTAssertEqual(HausGhostPaths.width(forHeight: 204), 192, accuracy: 0.001)
        XCTAssertEqual(HausGhostPaths.width(forHeight: 22), 22 * 192 / 204, accuracy: 0.001)
    }

    private func corners(of rect: CGRect) -> [CGPoint] {
        [
            CGPoint(x: rect.minX + 1, y: rect.midY),
            CGPoint(x: rect.maxX - 1, y: rect.midY),
            CGPoint(x: rect.midX, y: rect.minY + 1),
            CGPoint(x: rect.midX, y: rect.maxY - 1),
        ]
    }
}

final class HausGhostDriftTests: XCTestCase {
    func testEveryLoopStepsOnOneSharedGrid() {
        // The blobs drift inside a Gaussian blur nested in two masks and a
        // clip, so what costs is the number of frames the mark redraws on, not
        // how many blobs moved in one. Break the alignment and the cost
        // multiplies by three.
        for blob in HausGhostDrift.blobs {
            let segments = Double(blob.keyframes.count - 1)
            XCTAssertEqual(
                blob.period / (segments * Double(blob.steps)),
                HausGhostDrift.tick,
                accuracy: 0.0001
            )
        }
        XCTAssertEqual(HausGhostDrift.tick(for: .calm), 0.3, accuracy: 0.0001)
        XCTAssertEqual(HausGhostDrift.tick(for: .lively), 0.12, accuracy: 0.0001)
    }

    func testAStepHoldsUntilTheNextTick() {
        let atRest = HausGhostDrift.offsets(atPhase: 0, tempo: .calm)

        XCTAssertEqual(HausGhostDrift.offsets(atPhase: 0.29, tempo: .calm), atRest)
        XCTAssertNotEqual(HausGhostDrift.offsets(atPhase: 0.3, tempo: .calm), atRest)
        // Lively scales the periods and the grid together, so the alignment
        // survives both tempos.
        let lively = HausGhostDrift.offsets(atPhase: 0, tempo: .lively)
        XCTAssertEqual(HausGhostDrift.offsets(atPhase: 0.11, tempo: .lively), lively)
        XCTAssertNotEqual(HausGhostDrift.offsets(atPhase: 0.12, tempo: .lively), lively)
    }

    func testAPhaseIsADeterministicFunctionOfElapsedTime() {
        let phase = Date(timeIntervalSinceReferenceDate: 812_345.7).timeIntervalSinceReferenceDate

        XCTAssertEqual(
            HausGhostDrift.offsets(atPhase: phase, tempo: .calm),
            HausGhostDrift.offsets(atPhase: phase, tempo: .calm)
        )
        // The periods are 20, 28 and 16 ticks, so the three loops only return
        // to the same phase every 6 * 8.4 * 4.8 / gcd — 168 seconds.
        XCTAssertEqual(
            HausGhostDrift.offsets(atPhase: phase, tempo: .calm),
            HausGhostDrift.offsets(atPhase: phase + 168, tempo: .calm)
        )
    }

    func testEachBlobStaysInItsOwnQuadrant() {
        // Azure never leaves the upper right and rose never leaves the
        // lower-right contour, so the arrangement the mark is known by holds at
        // every phase and not just at rest.
        let width = HausGhostPaths.viewBoxWidth
        let height = HausGhostPaths.viewBoxHeight
        let travelled = { (blob: HausGhostBlob) -> [CGPoint] in
            blob.keyframes.map {
                CGPoint(x: blob.center.x + $0.width, y: blob.center.y + $0.height)
            }
        }
        let azure = travelled(HausGhostDrift.blobs[0])
        let rose = travelled(HausGhostDrift.blobs[2])

        XCTAssertTrue(azure.allSatisfy { $0.x > width / 2 && $0.y < height * 0.6 })
        XCTAssertTrue(rose.allSatisfy { $0.x > width / 2 && $0.y > height * 0.6 })
        for blob in HausGhostDrift.blobs {
            let points = travelled(blob)
            let reach = max(
                points.map(\.x).max()! - points.map(\.x).min()!,
                points.map(\.y).max()! - points.map(\.y).min()!
            )
            // It earns its cost from reach — half the mark, not a quarter — so
            // a loop that shrinks back toward the old extent is the regression.
            XCTAssertGreaterThan(reach, width * 0.4)
        }
    }
}

/// What every pause the mark answers to — Reduce Motion, a backgrounded scene,
/// a shut drawer — has to keep doing: hold the frame, then carry on from it.
final class HausGhostDriftClockTests: XCTestCase {
    func testAHeldClockKeepsAnsweringTheMomentItStopped() {
        let stopped = Date(timeIntervalSinceReferenceDate: 812_345.7)
        var clock = HausGhostDriftClock()
        clock.hold(at: stopped)

        XCTAssertTrue(clock.isHeld)
        XCTAssertEqual(clock.phase(at: stopped.addingTimeInterval(9)), clock.phase(at: stopped))
        XCTAssertEqual(
            HausGhostDrift.offsets(atPhase: clock.phase(at: stopped.addingTimeInterval(60)), tempo: .calm),
            HausGhostDrift.offsets(atPhase: stopped.timeIntervalSinceReferenceDate, tempo: .calm)
        )
    }

    func testResumingPicksUpTheHeldFrameRatherThanRestarting() {
        let stopped = Date(timeIntervalSinceReferenceDate: 812_345.7)
        var clock = HausGhostDriftClock()
        clock.hold(at: stopped)
        // A second hold must not re-stamp the frame the mark is standing on.
        clock.hold(at: stopped.addingTimeInterval(30))
        let held = clock.phase(at: stopped.addingTimeInterval(30))
        clock.resume(at: stopped.addingTimeInterval(47))

        XCTAssertFalse(clock.isHeld)
        // The 47 slept seconds are gone, so the drift continues from the frame
        // it froze on — not from zero, and not from where the wall clock got to.
        XCTAssertEqual(clock.phase(at: stopped.addingTimeInterval(47)), held, accuracy: 0.0001)
        XCTAssertEqual(clock.phase(at: stopped.addingTimeInterval(47.9)), held + 0.9, accuracy: 0.0001)
        XCTAssertEqual(
            HausGhostDrift.offsets(atPhase: clock.phase(at: stopped.addingTimeInterval(47)), tempo: .calm),
            HausGhostDrift.offsets(atPhase: held, tempo: .calm)
        )
        XCTAssertNotEqual(clock.phase(at: stopped.addingTimeInterval(47)), 0)
    }
}

final class HausGhostTempoTests: XCTestCase {
    func testOnlyAReadyAndNonEmptySnapshotQuickensTheDrift() {
        XCTAssertEqual(
            HausGhostTempo.resolve(isSnapshotReady: true, hasWorkingAgent: true),
            .lively
        )
        XCTAssertEqual(
            HausGhostTempo.resolve(isSnapshotReady: true, hasWorkingAgent: false),
            .calm
        )
        // An unsettled snapshot reads as calm rather than busy: guessing the
        // other way announces work that never happened on every cold launch.
        XCTAssertEqual(
            HausGhostTempo.resolve(isSnapshotReady: false, hasWorkingAgent: true),
            .calm
        )
    }

    func testLivelyRunsTheSameLoopsFasterRatherThanDifferentOnes() {
        XCTAssertEqual(HausGhostTempo.calm.multiplier, 1)
        XCTAssertEqual(HausGhostTempo.lively.multiplier, 0.4)
        XCTAssertEqual(
            HausGhostDrift.offsets(atPhase: 2.5, tempo: .lively),
            HausGhostDrift.offsets(atPhase: 2.5 / 0.4, tempo: .calm)
        )
    }
}

final class HausGhostPaletteTests: XCTestCase {
    /// The mark keeps its own colors on every ground, so only the scatter and
    /// the halo move between light and dark — and they move to these numbers.
    func testTheGroundOnlyChangesTheScatterAndTheHalo() {
        XCTAssertEqual(HausGhostGround.of(.light), .light)
        XCTAssertEqual(HausGhostGround.of(.dark), .dark)

        XCTAssertEqual(HausGhostGround.light.scatter, 0.1)
        XCTAssertEqual(HausGhostGround.light.scatterMid, 0.72)
        XCTAssertEqual(HausGhostGround.light.scatterOuter, 0.3)
        XCTAssertEqual(HausGhostGround.light.halo, 0.22)

        // On a near-black ground a nearly clear body is just a hole, so the
        // scatter has to supply the ground itself: near-solid, and nearly flat.
        XCTAssertEqual(HausGhostGround.dark.scatter, 0.94)
        XCTAssertEqual(HausGhostGround.dark.scatterMid, 0.98)
        XCTAssertEqual(HausGhostGround.dark.scatterOuter, 0.96)
        XCTAssertEqual(HausGhostGround.dark.halo, 0.3)

        XCTAssertEqual(HausGhostGround.light.scatterPeak, HausGhostGround.dark.scatterPeak)
    }

    func testTheInteriorFoldsTheScatterIntoItsStops() {
        let stops = HausGhostGround.dark.interiorGradient.stops

        XCTAssertEqual(stops.map(\.location), [0, 0.6, 1])
        XCTAssertEqual(
            stops.map { $0.color.resolve(in: EnvironmentValues()).opacity },
            [0.94, 0.94 * 0.98, 0.94 * 0.96].map(Float.init),
            "each stop is the rect's fill-opacity times its own share of it"
        )
    }

    func testTheBrandColorsAreTheAppsOwn() {
        assertColor(HausGhostPalette.azure, 0x00, 0xBA, 0xFF)
        assertColor(HausGhostPalette.violet, 0xA5, 0x51, 0xFF)
        assertColor(HausGhostPalette.rose, 0xFF, 0x43, 0xA6)
        assertColor(HausGhostPalette.roseLight, 0xFF, 0x78, 0xBD)
        assertColor(HausGhostPalette.edgeCool, 0x8D, 0x92, 0xC5)
        assertColor(HausGhostPalette.meshAzure, 0x00, 0xAD, 0xFF)
        assertColor(HausGhostPalette.meshViolet, 0x95, 0x39, 0xFF)
        assertColor(HausGhostPalette.meshRose, 0xFF, 0x43, 0xA6)
        assertColor(HausGhostPalette.eye, 0x1F, 0x1D, 0x24)
    }

    /// SVG masks by luminance and `Canvas` masks by alpha, so each fade stop is
    /// carried as the alpha its gray would have produced.
    func testTheFadeMasksCarryTheirGrayRampAsAlpha() {
        let side = HausGhostPalette.sideFade.stops

        XCTAssertEqual(side.map(\.location), [0, 0.3, 0.65, 1])
        XCTAssertEqual(
            side.map { $0.color.resolve(in: EnvironmentValues()).opacity },
            [0x26, 0x4D, 0xD0, 0xFF].map { Float(Double($0) / 255) }
        )
        // Neither fade reaches black: the upper left keeps a trace of color and
        // the white line still traces the far edge, so no layer stops at a line.
        XCTAssertGreaterThan(side[0].color.resolve(in: EnvironmentValues()).opacity, 0)
        XCTAssertGreaterThan(
            HausGhostPalette.domeFade.stops.last!.color.resolve(in: EnvironmentValues()).opacity,
            0
        )
        XCTAssertEqual(HausGhostPalette.rimMaskFloor, Double(0x3E) / 255)
    }

    private func assertColor(
        _ color: Color,
        _ red: Int,
        _ green: Int,
        _ blue: Int,
        line: UInt = #line
    ) {
        let resolved = color.resolve(in: EnvironmentValues())
        XCTAssertEqual(resolved.red, Float(Double(red) / 255), accuracy: 0.004, line: line)
        XCTAssertEqual(resolved.green, Float(Double(green) / 255), accuracy: 0.004, line: line)
        XCTAssertEqual(resolved.blue, Float(Double(blue) / 255), accuracy: 0.004, line: line)
    }
}
