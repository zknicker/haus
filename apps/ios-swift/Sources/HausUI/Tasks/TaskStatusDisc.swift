import HausModels
import SwiftUI

/// The shared status shape behind every Haus status glyph.
///
/// `ClaimStatusPresentation` should not learn about color, so this is the one
/// place a claim status becomes a hue, mirroring the desktop
/// `taskStatusDiscClasses` mapping.
enum TaskStatusShape: Sendable, CaseIterable {
    case todo
    case inProgress
    case inReview
    case done
    case closed

    /// The canonical Haus status hue. Mirrors the web label tokens:
    /// todo orange, in progress blue, in review purple, done green, closed gray.
    var tint: Color {
        switch self {
        case .todo: .orange
        case .inProgress: .blue
        case .inReview: .purple
        case .done: .green
        case .closed: .secondary
        }
    }

    /// How much of the inner pie is filled while the claim is still live.
    fileprivate var fillFraction: CGFloat {
        switch self {
        case .todo: 0
        case .inProgress: 0.5
        case .inReview: 0.75
        case .done, .closed: 1
        }
    }
}

extension TaskStatusShape {
    init(_ status: ClaimStatusPresentation) {
        switch status {
        case .todo: self = .todo
        case .inProgress: self = .inProgress
        case .inReview: self = .inReview
        case .done: self = .done
        case .closed: self = .closed
        }
    }
}

/// Linear-style claim status disc: an outline ring that fills clockwise as the
/// claim progresses, landing on a solid check (done) or cross (closed).
///
/// Geometry is the desktop SVG's 16pt viewBox scaled by `size`. Terminal-state
/// glyphs are cut out in `surface` rather than white: the disc fills with a
/// saturated hue, and a white cutout washes out against it in dark mode.
struct TaskStatusDisc: View {
    let status: TaskStatusShape
    var size: CGFloat = 16
    var surface: Color = HausPlatformColor.background

    var body: some View {
        ZStack {
            switch status {
            case .done:
                terminalDisc { TaskDoneCheck() }
            case .closed:
                terminalDisc { TaskClosedCross() }
            case .todo, .inProgress, .inReview:
                ring
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private var unit: CGFloat { size / 16 }

    private var ring: some View {
        ZStack {
            Circle()
                .stroke(status.tint, lineWidth: 1.5 * unit)
                .frame(width: 12 * unit, height: 12 * unit)

            if status.fillFraction > 0 {
                // A half-radius circle stroked as wide as itself renders a solid
                // pie wedge, the SVG dasharray trick translated to `trim`.
                Circle()
                    .trim(from: 0, to: status.fillFraction)
                    .stroke(status.tint, style: StrokeStyle(lineWidth: 4 * unit, lineCap: .butt))
                    .frame(width: 4 * unit, height: 4 * unit)
                    .rotationEffect(.degrees(-90))
            }
        }
    }

    private func terminalDisc(@ViewBuilder glyph: () -> some Shape) -> some View {
        ZStack {
            Circle()
                .fill(status.tint)
                .frame(width: 13.5 * unit, height: 13.5 * unit)
            glyph()
                .stroke(
                    surface,
                    style: StrokeStyle(lineWidth: 1.5 * unit, lineCap: .round, lineJoin: .round)
                )
                .frame(width: size, height: size)
        }
    }
}

struct TaskDoneCheck: Shape {
    func path(in rect: CGRect) -> Path {
        let unit = rect.width / 16
        var path = Path()
        path.move(to: CGPoint(x: 5.1 * unit, y: 8.3 * unit))
        path.addLine(to: CGPoint(x: 7.1 * unit, y: 10.3 * unit))
        path.addLine(to: CGPoint(x: 10.9 * unit, y: 6.1 * unit))
        return path
    }
}

struct TaskClosedCross: Shape {
    func path(in rect: CGRect) -> Path {
        let unit = rect.width / 16
        var path = Path()
        path.move(to: CGPoint(x: 5.9 * unit, y: 5.9 * unit))
        path.addLine(to: CGPoint(x: 10.1 * unit, y: 10.1 * unit))
        path.move(to: CGPoint(x: 10.1 * unit, y: 5.9 * unit))
        path.addLine(to: CGPoint(x: 5.9 * unit, y: 10.1 * unit))
        return path
    }
}

#Preview("Status discs") {
    HStack(spacing: 16) {
        ForEach(Array(TaskStatusShape.allCases.enumerated()), id: \.offset) { _, status in
            TaskStatusDisc(status: status, size: 24)
        }
    }
    .padding(40)
}
