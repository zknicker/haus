import HausModels
import SwiftUI

/// A Task state's disc, as the App draws it: a plain ring for todo, a
/// half-filled ring for open, and a solid disc with a check or a cross once the
/// work has ended. A state this build does not know wears the todo ring. An
/// unfinished Task waiting on the reader wears an accent ring with a dot.
///
/// Geometry is `TaskStatusDisc`'s 16pt viewBox scaled by `size`.
struct TaskStateDisc: View {
    let state: TaskState
    var size: CGFloat = 16
    var surface: Color = HausPlatformColor.background
    var isWaitingOnYou = false

    var body: some View {
        ZStack {
            if isWaitingOnYou, !state.isClosed {
                ring
                Circle()
                    .fill(tint)
                    .frame(width: 4.5 * unit, height: 4.5 * unit)
            } else {
                disc
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private var disc: some View {
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

    private var unit: CGFloat { size / 16 }

    private var tint: Color {
        if isWaitingOnYou, !state.isClosed { return HausPlatformColor.accentInk }
        return switch state {
        case .todo, .unknown: HausPlatformColor.mutedInk
        case .canceled: HausPlatformColor.faintInk
        case .open: HausPlatformColor.caution
        case .done: HausPlatformColor.positive
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
