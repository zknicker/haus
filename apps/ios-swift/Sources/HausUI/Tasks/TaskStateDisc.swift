import HausModels
import SwiftUI

/// A Task state's disc, as the App draws it: a plain ring for todo, a
/// half-filled ring for open, and a solid disc with a check or a cross once the
/// work has ended. A state this build does not know wears the todo ring.
///
/// Geometry is `TaskStatusDisc`'s 16pt viewBox scaled by `size`.
struct TaskStateDisc: View {
    let state: TaskState
    var size: CGFloat = 16
    var surface: Color = HausPlatformColor.background

    var body: some View {
        ZStack {
            switch state {
            case .todo, .unknown:
                ring
            case .open:
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
        switch state {
        case .todo, .unknown, .canceled: .secondary
        case .open: .orange
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

#Preview("State discs") {
    HStack(spacing: 16) {
        ForEach([TaskState.todo, .open, .done, .canceled], id: \.self) { state in
            TaskStateDisc(state: state, size: 24)
        }
    }
    .padding(40)
}
