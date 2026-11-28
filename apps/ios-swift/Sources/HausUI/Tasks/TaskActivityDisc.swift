import HausModels
import SwiftUI

/// What a Task's disc says: archived, or its activity while active. A surface
/// that reads no activity, such as an origin preview, says only Active.
public enum TaskDiscState: Hashable, Sendable {
    case active(TaskActivityStatus?)
    case archived

    public init(isArchived: Bool, status: TaskActivityStatus?) {
        self = isArchived ? .archived : .active(status)
    }

    public init(_ task: TaskRecord) {
        self.init(isArchived: task.isArchived, status: task.status)
    }

    /// The words every surface shows beside the disc, as the web App says them.
    public var label: String {
        switch self {
        case .archived: "Archived"
        case let .active(status?): status.label
        case .active(nil): "Active"
        }
    }
}

/// A Task's disc: a half-filled ring while it works, an accent ring with a dot
/// while it needs you, a critical ring after a failed turn, a plain ring while
/// it idles or waits, and a closed disc once archived.
///
/// Geometry is `TaskStatusDisc`'s 16pt viewBox scaled by `size`.
struct TaskActivityDisc: View {
    let state: TaskDiscState
    var size: CGFloat = 16
    var surface: Color = HausPlatformColor.canvas

    var body: some View {
        ZStack {
            switch state {
            case .archived:
                Circle()
                    .fill(tint)
                    .frame(width: 13.5 * unit, height: 13.5 * unit)
                TaskClosedCross()
                    .stroke(surface, style: StrokeStyle(lineWidth: 1.5 * unit, lineCap: .round, lineJoin: .round))
                    .frame(width: size, height: size)
            case .active(.working):
                ring
                Circle()
                    .trim(from: 0, to: 0.5)
                    .stroke(tint, style: StrokeStyle(lineWidth: 4 * unit, lineCap: .butt))
                    .frame(width: 4 * unit, height: 4 * unit)
                    .rotationEffect(.degrees(-90))
            case .active(.needsYou):
                ring
                Circle()
                    .fill(tint)
                    .frame(width: 4.5 * unit, height: 4.5 * unit)
            case .active(.failed), .active(.waiting), .active(.idle), .active(nil):
                ring
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private var unit: CGFloat { size / 16 }

    /// The web App's activity chip colors: accent while working, warning
    /// while it needs you, danger after a failure, muted otherwise.
    private var tint: Color {
        switch state {
        case .archived: HausPlatformColor.faintInk
        case .active(.working): HausPlatformColor.accentInk
        case .active(.needsYou): HausPlatformColor.caution
        case .active(.failed): HausPlatformColor.critical
        case .active(.waiting), .active(.idle), .active(nil): HausPlatformColor.mutedInk
        }
    }

    private var ring: some View {
        Circle()
            .stroke(tint, lineWidth: 1.5 * unit)
            .frame(width: 12 * unit, height: 12 * unit)
    }
}

#Preview("Task discs") {
    HStack(spacing: 16) {
        ForEach(TaskActivityStatus.allCases, id: \.self) { status in
            TaskActivityDisc(state: .active(status), size: 24)
        }
        TaskActivityDisc(state: .archived, size: 24)
    }
    .padding(40)
}
