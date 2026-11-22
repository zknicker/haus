import HausModels
import SwiftUI

/// What a priority draws as, from the App's `task-priority-icon.tsx`: signal
/// bars for low, medium, and high, an exclamation tile for urgent, and faint
/// dots when unset.
enum TaskPriorityGlyph: Equatable, Sendable {
    case unset
    case bars(filled: Int)
    case urgent

    init(_ priority: TaskPriority) {
        switch priority {
        case .none: self = .unset
        case .low: self = .bars(filled: 1)
        case .medium: self = .bars(filled: 2)
        case .high: self = .bars(filled: 3)
        case .urgent: self = .urgent
        }
    }
}

/// The priority glyph on the App's 16pt viewBox, scaled by `size`. Bars and
/// dots ride the foreground style; urgent always carries the critical tile.
struct TaskPriorityIcon: View {
    let priority: TaskPriority
    var size: CGFloat = 15
    var surface: Color = HausPlatformColor.canvas

    var body: some View {
        Canvas { context, canvas in
            let unit = canvas.width / 16
            switch TaskPriorityGlyph(priority) {
            case .unset:
                for x in [3.5, 8, 12.5] {
                    let dot = CGRect(x: (x - 1) * unit, y: 7 * unit, width: 2 * unit, height: 2 * unit)
                    context.fill(Path(ellipseIn: dot), with: .style(.foreground.opacity(0.45)))
                }
            case .bars(let filled):
                for (index, bar) in Self.bars.enumerated() {
                    let rect = CGRect(x: bar.x * unit, y: bar.y * unit, width: 3 * unit, height: bar.height * unit)
                    let path = Path(roundedRect: rect, cornerRadius: unit)
                    context.fill(path, with: .style(.foreground.opacity(index < filled ? 1 : 0.28)))
                }
            case .urgent:
                let tile = CGRect(x: 1.5 * unit, y: 1.5 * unit, width: 13 * unit, height: 13 * unit)
                context.fill(Path(roundedRect: tile, cornerRadius: 3.5 * unit), with: .color(HausPlatformColor.critical))
                var stem = Path()
                stem.move(to: CGPoint(x: 8 * unit, y: 4.5 * unit))
                stem.addLine(to: CGPoint(x: 8 * unit, y: 8.5 * unit))
                context.stroke(stem, with: .color(surface), style: StrokeStyle(lineWidth: 1.6 * unit, lineCap: .round))
                let dot = CGRect(x: 7.1 * unit, y: 10.3 * unit, width: 1.8 * unit, height: 1.8 * unit)
                context.fill(Path(ellipseIn: dot), with: .color(surface))
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private static let bars: [(x: CGFloat, y: CGFloat, height: CGFloat)] = [
        (2, 9, 5),
        (6.5, 6, 8),
        (11, 3, 11),
    ]
}

#Preview("Priorities") {
    HStack(spacing: 16) {
        ForEach(TaskPriority.pickerOrder, id: \.self) { priority in
            TaskPriorityIcon(priority: priority, size: 24)
        }
    }
    .foregroundStyle(HausPlatformColor.mutedInk)
    .padding(40)
}
