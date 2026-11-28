import HausModels
import SwiftUI

/// The 12 pt grip on the list column's trailing edge. Its grabber follows the
/// finger, and letting go snaps the column to hidden, the rail, or the full
/// list by where the edge would land (`ListColumnLayout.released`). Half open
/// on a surface, grip and touch area keep to the larger side of the fold.
struct ListColumnHandle: View {
    let width: CGFloat
    let hasRail: Bool
    let onRelease: (ListColumn) -> Void

    @GestureState private var travel: CGFloat = 0

    var body: some View {
        FoldReader { size, fold in
            let span = ListColumnLayout.handleSpan(height: size.height, fold: fold)
            grip
                .frame(width: ListColumnLayout.handleWidth, height: span.upperBound - span.lowerBound)
                .offset(y: span.lowerBound)
        }
        .frame(width: ListColumnLayout.handleWidth)
        .frame(maxHeight: .infinity)
    }

    private var grip: some View {
        Capsule()
            .fill(HausPlatformColor.faintInk)
            .frame(width: 4, height: 36)
            .offset(x: travel)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
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
