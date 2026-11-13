import HausModels
import SwiftUI

/// A column category's disc: a dashed ring for backlog, a plain ring for todo, a
/// half-filled ring for active, and a solid disc with a check or a cross once
/// the work is finished. The column name is presentation; this is what the
/// category looks like wherever a column is named.
///
/// Geometry is `TaskStatusDisc`'s 16pt viewBox scaled by `size`.
struct TaskCategoryDisc: View {
    let category: ColumnCategory
    var size: CGFloat = 16
    var surface: Color = HausPlatformColor.background

    var body: some View {
        ZStack {
            switch category {
            case .backlog:
                Circle()
                    .stroke(tint, style: StrokeStyle(lineWidth: 1.5 * unit, dash: [2.2 * unit, 2 * unit]))
                    .frame(width: 12 * unit, height: 12 * unit)
            case .todo:
                ring
            case .active:
                ZStack {
                    ring
                    Circle()
                        .trim(from: 0, to: 0.5)
                        .stroke(tint, style: StrokeStyle(lineWidth: 4 * unit, lineCap: .butt))
                        .frame(width: 4 * unit, height: 4 * unit)
                        .rotationEffect(.degrees(-90))
                }
            case .done:
                closedDisc { TaskDoneCheck() }
            case .canceled:
                closedDisc { TaskClosedCross() }
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private var unit: CGFloat { size / 16 }

    private var tint: Color {
        switch category {
        case .backlog, .todo, .canceled: .secondary
        case .active: .orange
        case .done: .blue
        }
    }

    private var ring: some View {
        Circle()
            .stroke(tint, lineWidth: 1.5 * unit)
            .frame(width: 12 * unit, height: 12 * unit)
    }

    private func closedDisc(@ViewBuilder glyph: () -> some Shape) -> some View {
        ZStack {
            Circle()
                .fill(tint)
                .frame(width: 13.5 * unit, height: 13.5 * unit)
            glyph()
                .stroke(surface, style: StrokeStyle(lineWidth: 1.5 * unit, lineCap: .round, lineJoin: .round))
                .frame(width: size, height: size)
        }
    }
}

extension ColumnCategory {
    /// The disc in a system menu, which draws an image and text and nothing else.
    var symbolName: String {
        switch self {
        case .backlog: "circle.dashed"
        case .todo: "circle"
        case .active: "circle.lefthalf.filled"
        case .done: "checkmark.circle.fill"
        case .canceled: "xmark.circle.fill"
        }
    }
}

#Preview("Category discs") {
    HStack(spacing: 16) {
        ForEach(ColumnCategory.allCases, id: \.self) { category in
            TaskCategoryDisc(category: category, size: 24)
        }
    }
    .padding(40)
}
