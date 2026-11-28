import SwiftUI

/// The detail column: the conversation, and in Task mode the Task beside it,
/// placed by `TaskModePanes` along the fold. One `Layout` places both, so
/// opening the Task, turning the Duo, or half opening it never remounts the
/// conversation.
public struct TaskModeSplit<Conversation: View, TaskPane: View>: View {
    private let isOpen: Bool
    private let conversation: Conversation
    private let task: TaskPane

    @Environment(\.listColumnIsFull) private var listIsFull

    public init(isOpen: Bool, @ViewBuilder conversation: () -> Conversation, @ViewBuilder task: () -> TaskPane) {
        self.isOpen = isOpen
        self.conversation = conversation()
        self.task = task()
    }

    public var body: some View {
        FoldReader { size, fold in
            let panes = TaskModePanes.layout(size: size, fold: fold, isOpen: isOpen, listIsFull: listIsFull)
            let edge: Edge = (panes.task?.minY ?? 0) > 0 ? .top : .leading
            TaskModeLayout(frames: TaskModePanes.placements(size: size, fold: fold, isOpen: isOpen, listIsFull: listIsFull)) {
                conversation
                if isOpen {
                    task
                        .environment(\.taskPaneEdge, edge)
                        .transition(.move(edge: edge == .top ? .bottom : .trailing).combined(with: .opacity))
                }
            }
            .animation(.smooth(duration: 0.3), value: panes)
        }
    }
}

extension EnvironmentValues {
    /// The Task pane's edge that meets its conversation: leading side by
    /// side, top above and below.
    @Entry public var taskPaneEdge = Edge.leading
}

private struct TaskModeLayout: Layout {
    let frames: [CGRect]

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        proposal.replacingUnspecifiedDimensions()
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for (subview, frame) in zip(subviews, frames) {
            subview.place(
                at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY),
                anchor: .topLeading,
                proposal: ProposedViewSize(frame.size)
            )
        }
    }
}
