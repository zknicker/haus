import SwiftUI

/// The detail column in Task mode: the conversation leads and the Task
/// trails, in equal panes, or meeting at the fold when the Duo is half open
/// (`TaskModePanes`). The fold is the division region iOS 27.1 reserves; it
/// is empty fully open and closed, so the panes split evenly then and on
/// earlier systems. The conversation keeps its place in the `HStack`, so
/// opening and closing the Task never remounts it.
public struct TaskModeSplit<Conversation: View, TaskPane: View>: View {
    private let isOpen: Bool
    private let conversation: Conversation
    private let task: TaskPane

    public init(isOpen: Bool, @ViewBuilder conversation: () -> Conversation, @ViewBuilder task: () -> TaskPane) {
        self.isOpen = isOpen
        self.conversation = conversation()
        self.task = task()
    }

    public var body: some View {
        GeometryReader { proxy in
            let panes = TaskModePanes.layout(width: proxy.size.width, fold: Self.fold(in: proxy))
            HStack(spacing: 0) {
                conversation
                    .padding(.trailing, isOpen ? panes.clearance : 0)
                    .frame(width: isOpen ? panes.conversationWidth : proxy.size.width)
                if isOpen {
                    Color.clear.frame(width: panes.foldWidth)
                    task
                        .padding(.leading, panes.clearance)
                        .frame(width: panes.taskWidth)
                        .transition(.move(edge: .trailing).combined(with: .opacity))
                }
            }
            .animation(.smooth(duration: 0.3), value: isOpen)
        }
    }

    /// A fold running top to bottom, as when the Duo stands half open like
    /// a book. A tabletop fold runs across and splits nothing here.
    private static func fold(in proxy: GeometryProxy) -> ClosedRange<CGFloat>? {
        #if os(iOS)
        if #available(iOS 27.1, *) {
            let region = proxy.reservedRegions(kind: .division).first { $0.frame.height > $0.frame.width }
            return region.map { $0.frame.minX...$0.frame.maxX }
        }
        #endif
        return nil
    }
}
