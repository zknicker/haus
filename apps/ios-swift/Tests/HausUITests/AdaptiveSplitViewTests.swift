import SwiftUI
import Testing
@testable import HausUI

@Suite("Adaptive split")
struct AdaptiveSplitViewTests {
    @Test("The list pane shows beside the content, and steps aside for a side pane")
    func listStepsAsideForSide() {
        #expect(AdaptiveSplitView<EmptyView, EmptyView, EmptyView>.columnVisibility(showsSide: false) == .all)
        #expect(AdaptiveSplitView<EmptyView, EmptyView, EmptyView>.columnVisibility(showsSide: true) == .detailOnly)
    }
}
