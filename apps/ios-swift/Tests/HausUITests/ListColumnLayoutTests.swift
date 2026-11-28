import HausModels
import SwiftUI
import Testing
@testable import HausUI

struct ListColumnLayoutTests {
    @Test func aDragReleasedNarrowTakesTheRailAndNarrowerStillHidesTheColumn() {
        #expect(ListColumnLayout.released(at: 330, hasRail: true) == .full)
        #expect(ListColumnLayout.released(at: 160, hasRail: true) == .full)
        #expect(ListColumnLayout.released(at: 159, hasRail: true) == .rail)
        #expect(ListColumnLayout.released(at: 40, hasRail: true) == .rail)
        #expect(ListColumnLayout.released(at: 39, hasRail: true) == .hidden)
        #expect(ListColumnLayout.released(at: -50, hasRail: true) == .hidden)
    }

    @Test func dragsFromTheRailWidenToTheFullListOrHideIt() {
        let rail = ListColumnLayout.railWidth
        #expect(ListColumnLayout.released(at: rail + 100, hasRail: true) == .full)
        #expect(ListColumnLayout.released(at: rail + 20, hasRail: true) == .rail)
        #expect(ListColumnLayout.released(at: rail - 50, hasRail: true) == .hidden)
    }

    @Test func aTabWithoutARailIsFullOrHidden() {
        #expect(ListColumnLayout.released(at: 100, hasRail: false) == .full)
        #expect(ListColumnLayout.released(at: 20, hasRail: false) == .hidden)
        #expect(ListColumn.rail.shown(hasRail: false) == .full)
        #expect(ListColumn.rail.shown(hasRail: true) == .rail)
        #expect(ListColumn.hidden.shown(hasRail: false) == .hidden)
    }

    @Test func theSystemColumnShowsOnlyTheFullList() {
        #expect(ListColumn.full.visibility == .all)
        #expect(ListColumn.rail.visibility == .detailOnly)
        #expect(ListColumn.hidden.visibility == .detailOnly)
    }
}
