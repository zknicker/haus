import HausModels
import SwiftUI

/// The 12 pt grip on the list column's trailing edge. Its grabber follows the
/// finger, and letting go snaps the column to hidden, the rail, or the full
/// list by where the edge would land (`ListColumnLayout.released`).
struct ListColumnHandle: View {
    let width: CGFloat
    let hasRail: Bool
    let onRelease: (ListColumn) -> Void

    @GestureState private var travel: CGFloat = 0

    var body: some View {
        Capsule()
            .fill(HausPlatformColor.faintInk)
            .frame(width: 4, height: 36)
            .offset(x: travel)
            .frame(width: ListColumnLayout.handleWidth)
            .frame(maxHeight: .infinity)
            .contentShape(.rect)
            .gesture(drag)
            .accessibilityElement()
            .accessibilityLabel("List width")
            .accessibilityAddTraits(.isButton)
            .accessibilityActions {
                ForEach(actions, id: \.self) { column in
                    Button(Self.actionTitle(column)) { onRelease(column) }
                }
            }
    }

    private var drag: some Gesture {
        DragGesture(minimumDistance: 4)
            .updating($travel) { value, travel, _ in travel = value.translation.width }
            .onEnded { value in
                onRelease(ListColumnLayout.released(at: width + value.translation.width, hasRail: hasRail))
            }
    }

    private var actions: [ListColumn] {
        ListColumn.allCases.filter { $0 != .rail || hasRail }
    }

    private static func actionTitle(_ column: ListColumn) -> String {
        switch column {
        case .full: "Show list"
        case .rail: "Show rail"
        case .hidden: "Hide list"
        }
    }
}
