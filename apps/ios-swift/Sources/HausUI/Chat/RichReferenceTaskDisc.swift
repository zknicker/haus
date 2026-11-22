import CoreGraphics
import HausModels
#if canImport(UIKit)
import SwiftUI
import UIKit
#endif

/// A Task reference's state disc on its 16pt viewBox, as `TaskStateDisc`
/// lays it out: a ring for todo, a ring with its right half filled for open,
/// and a solid disc with a check or a cross once the work has ended.
struct RichReferenceTaskDisc: Equatable {
    enum Mark: Equatable {
        case ring
        case halfFilled
        case check
        case cross
    }

    let mark: Mark
    let rect: CGRect

    init(state: TaskState, in rect: CGRect) {
        self.rect = rect
        mark = switch state {
        case .todo, .unknown: .ring
        case .open: .halfFilled
        case .done: .check
        case .canceled: .cross
        }
    }

    var unit: CGFloat { min(rect.width, rect.height) / 16 }
    var center: CGPoint { CGPoint(x: rect.midX, y: rect.midY) }

    /// The ring's circle and stroke, for todo and open.
    var ring: (rect: CGRect, lineWidth: CGFloat) {
        (box(side: 12 * unit), 1.5 * unit)
    }

    /// The filled disc a closed state stands on.
    var closedDisc: CGRect { box(side: 13.5 * unit) }

    /// Open's right half, as a wedge of this radius.
    var halfRadius: CGFloat { 4 * unit }

    /// The check or the cross, in the disc's coordinates.
    var glyphStrokes: [[CGPoint]] {
        switch mark {
        case .check:
            [[point(5.1, 8.3), point(7.1, 10.3), point(10.9, 6.1)]]
        case .cross:
            [[point(5.9, 5.9), point(10.1, 10.1)], [point(10.1, 5.9), point(5.9, 10.1)]]
        case .ring, .halfFilled:
            []
        }
    }

    var glyphLineWidth: CGFloat { 1.5 * unit }

    private func box(side: CGFloat) -> CGRect {
        CGRect(x: center.x - side / 2, y: center.y - side / 2, width: side, height: side)
    }

    private func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
        let side = 16 * unit
        return CGPoint(x: center.x - side / 2 + x * unit, y: center.y - side / 2 + y * unit)
    }
}

#if canImport(UIKit)
extension RichReferenceTaskDisc {
    /// Paints the disc in the state's own ink, cutting the glyph out in the
    /// transcript's ground.
    @MainActor
    static func draw(state: TaskState, in rect: CGRect, context: CGContext) {
        let disc = RichReferenceTaskDisc(state: state, in: rect)
        let ink = UIColor(TaskStateDisc.tint(for: state))
        context.saveGState()
        defer { context.restoreGState() }
        switch disc.mark {
        case .ring, .halfFilled:
            ink.setStroke()
            context.setLineWidth(disc.ring.lineWidth)
            context.strokeEllipse(in: disc.ring.rect)
            guard disc.mark == .halfFilled else { return }
            ink.setFill()
            context.move(to: disc.center)
            context.addArc(center: disc.center, radius: disc.halfRadius, startAngle: -.pi / 2, endAngle: .pi / 2, clockwise: false)
            context.closePath()
            context.fillPath()
        case .check, .cross:
            ink.setFill()
            context.fillEllipse(in: disc.closedDisc)
            UIColor(HausPlatformColor.background).setStroke()
            context.setLineWidth(disc.glyphLineWidth)
            context.setLineCap(.round)
            context.setLineJoin(.round)
            for stroke in disc.glyphStrokes {
                guard let first = stroke.first else { continue }
                context.move(to: first)
                for point in stroke.dropFirst() { context.addLine(to: point) }
            }
            context.strokePath()
        }
    }
}
#endif
