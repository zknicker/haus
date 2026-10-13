import CoreGraphics
import Foundation
@testable import HausUI
import Testing

/// The numbers a reference draws itself from: the identity mark before the
/// label and the dotted rule beneath it.
///
/// A reference has no ground — the App's chip is the transparent `tertiary`
/// shell at `padding: 0` — so these two, plus the label's own ink, are the
/// whole of it, and every one of them is a fraction of the line the row was
/// measured at.
struct RichReferenceMarkGeometryTests {
    /// The mark and the gap after it are fractions of the line, so a reference
    /// scales with Dynamic Type without ever reaching past its own line — and
    /// the room bought inside the text is that pair and nothing else, because
    /// the App's chip has no padding to reserve.
    @Test func sizesTheMarkToTheLinesOwnBox() {
        for pointSize in RichReferenceMetricsFixture.bodyPointSizes {
            let metrics = RichReferenceMetricsFixture.sanFrancisco(pointSize: pointSize)
            let geometry = RichReferenceMarkGeometry(metrics: metrics)

            #expect(geometry.lineBox == metrics.ascent + metrics.descent)
            // Roughly twice the font's x-height: ~16pt inside 17pt body text.
            #expect(geometry.markSize >= metrics.xHeight * 2 * 0.85)
            #expect(geometry.markSize <= metrics.xHeight * 2 * 1.05)
            // And inside the line the row was measured at, top and bottom.
            #expect(geometry.markSize < geometry.lineBox)
            #expect(geometry.markGap > 0)
            // The spacer is the mark and the gap after it: no leading inset,
            // because there is no box to inset from.
            #expect(geometry.leadingSpacer == geometry.markSize + geometry.markGap)
        }
    }

    /// The mark rides the run's own leading edge, centered on the line's box —
    /// the one placement the renderer asks this geometry for.
    @Test func anchorsTheMarkToTheRunsLeadingEdgeAndTheLinesBox() {
        for pointSize in RichReferenceMetricsFixture.bodyPointSizes {
            let metrics = RichReferenceMetricsFixture.sanFrancisco(pointSize: pointSize)
            let geometry = RichReferenceMarkGeometry(metrics: metrics)
            let mark = geometry.markRect(leadingX: 12, baselineY: 40)

            #expect(mark.minX == 12)
            #expect(mark.width == geometry.markSize)
            #expect(mark.height == geometry.markSize)
            // Centered on the line's box, and clear of both its edges.
            #expect(abs(mark.midY - (40 - metrics.ascent + geometry.lineBox / 2)) < 0.001)
            #expect(mark.minY > 40 - metrics.ascent)
            #expect(mark.maxY < 40 + metrics.descent)

            // A Skill's smaller mark shrinks around the same center, so every
            // label starts at the same place.
            let skill = geometry.markRect(leadingX: 12, baselineY: 40, scale: 16.0 / 18.0)
            #expect(skill.width < mark.width)
            #expect(abs(skill.midX - mark.midX) < 0.001)
            #expect(abs(skill.midY - mark.midY) < 0.001)
        }
    }

    /// The dotted rule the App draws under a reference's label: a dot every
    /// other dot's width, under the label's glyphs alone, inside the line the
    /// row was measured at — a rule hanging below it would be clipped away on
    /// the last line of a message.
    @Test func underlinesTheLabelWithDotsInsideTheLine() {
        for pointSize in RichReferenceMetricsFixture.bodyPointSizes {
            let metrics = RichReferenceMetricsFixture.sanFrancisco(pointSize: pointSize)
            let underline = RichReferenceMarkGeometry(metrics: metrics).underline

            // The App's 0.12em dot in a 0.24em tile: half the period, always.
            #expect(underline.period == underline.diameter * 2)
            #expect(underline.diameter >= 1)
            #expect(underline.diameter < metrics.descent)
            // Flush with the line's floor, and never above the baseline.
            #expect(underline.centerDepth > 0)
            #expect(abs(underline.centerDepth + underline.diameter / 2 - metrics.descent) < 0.001)

            let dots = underline.dotCenters(fromX: 20, toX: 20 + underline.period * 4)
            #expect(dots.count == 4)
            // Tiled from the label's leading edge, the dot centered in its tile.
            #expect(abs(dots[0] - (20 + underline.period / 2)) < 0.001)
            #expect(abs(dots[1] - dots[0] - underline.period) < 0.001)
            // Every dot lands whole inside the label it underlines.
            for center in dots {
                #expect(center - underline.diameter / 2 >= 20)
                #expect(center + underline.diameter / 2 <= 20 + underline.period * 4)
            }
            // A label too narrow for one whole dot wears none.
            #expect(underline.dotCenters(fromX: 20, toX: 20 + underline.diameter / 2).isEmpty)

            let rect = underline.dotRect(centerX: 30, baselineY: 40)
            #expect(abs(rect.midX - 30) < 0.001)
            #expect(rect.width == underline.diameter)
            #expect(rect.height == underline.diameter)
            #expect(abs(rect.maxY - (40 + metrics.descent)) < 0.001)
        }
    }

    @Test func drawsTheSkillMarkSmallerThanEveryOtherMark() {
        #expect(RichReferenceMark.glyph(.skill).sizeScale < 1)
        #expect(RichReferenceMark.glyph(.document).sizeScale == 1)
        #expect(RichReferenceMark.avatar(nil).sizeScale == 1)
        #expect(RichReferenceMark.channel(.default).sizeScale == 1)
        // The shrink pays for the sparkles' own viewbox, so a Skill wearing a
        // brand mark instead is drawn at the same size as every other mark.
        #expect(RichReferenceMark.glyph(.github).sizeScale == 1)
        #expect(RichReferenceMark.brandGlyph(.chrome, .success).sizeScale == 1)
    }
}

/// SF's vertical metrics at a point size, as UIKit reports them: no leading,
/// and ascent, descent, cap height, and x-height in fixed proportion to the
/// size. The geometry is asked for numbers, not for a platform, so driving it
/// from these exercises it at two genuinely different sizes wherever these
/// tests run.
enum RichReferenceMetricsFixture {
    /// A default body size and the size an accessibility setting reaches.
    static let bodyPointSizes: [CGFloat] = [17, 40]

    static func sanFrancisco(pointSize: CGFloat) -> PlatformFontMetrics {
        PlatformFontMetrics(
            pointSize: pointSize,
            ascent: pointSize * 0.956,
            descent: pointSize * 0.2406,
            leading: 0,
            xHeight: pointSize * 0.5273,
            capHeight: pointSize * 0.7132
        )
    }
}
