import SwiftUI

#if !canImport(UIKit)

/// macOS exists in this package only so the pure logic can run under
/// `swift test`; the app targets iOS. This stand-in keeps the SwiftUI callers
/// compiling with the same shape and no scroll management.
struct TranscriptListView<Item: Identifiable & Equatable, Row: View, Accessory: View>: View
where Item.ID == String {
    let items: [Item]
    let topInset: CGFloat
    let bottomInset: CGFloat
    let showsAccessory: Bool
    let onAppend: (_ previousItems: [Item], _ items: [Item], _ isNearNewest: Bool) -> TranscriptAppendBehavior
    let reveal: TranscriptReveal?
    @Binding var isNearNewest: Bool
    var onContentTap: (() -> Void)? = nil
    var onVisibleItems: (([String]) -> Void)? = nil
    var animatesEntrance = false
    var menuActions: (Item) -> [TranscriptMenuAction] = { _ in [] }
    @ViewBuilder let row: (Item) -> Row
    @ViewBuilder let accessory: () -> Accessory

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                if showsAccessory {
                    accessory()
                }
                ForEach(items) { row($0) }
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            // Upright here, so the runway is the literal bottom padding.
            .padding(.bottom, HausChrome.transcriptBottomRunway)
        }
        .defaultScrollAnchor(.bottom)
    }
}

#endif
