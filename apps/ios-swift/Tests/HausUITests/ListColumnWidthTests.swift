import CoreGraphics
import Testing
@testable import HausUI

struct ListColumnWidthTests {
    @Test func openingAgainAsksForTheWidthFromBeforeTheFoldUntilTheSystemDrawsIt() {
        var width = ListColumnWidth()
        width.measured(280)
        #expect(width.fixed == nil)

        width.fold(to: 470)
        width.measured(470)
        #expect(width.fixed == 470)

        width.fold(to: nil)
        #expect(width.fixed == 280)
        width.measured(350)
        #expect(width.fixed == 280)
        width.measured(280)
        #expect(width.fixed == nil)

        width.measured(330)
        width.fold(to: 470)
        width.fold(to: nil)
        #expect(width.fixed == 330)
    }

    @Test func aHiddenColumnsWidthNeitherCountsAsOpenNorEndsTheRestore() {
        var width = ListColumnWidth()
        width.measured(280)
        width.fold(to: 470)
        width.fold(to: nil)
        width.measured(0)
        #expect(width.fixed == 280)
        width.measured(285)
        #expect(width.fixed == nil)
    }

    @Test func foldedBeforeAnyOpenWidthItRestoresToTheSystemFloor() {
        var width = ListColumnWidth()
        width.fold(to: 470)
        width.fold(to: nil)
        #expect(width.fixed == ListColumnLayout.fullMinimumWidth)
        width.measured(280)
        #expect(width.fixed == nil)
    }

    @Test func onlyHausMovesAColumnItHoldsAtTheFoldOrBesideATask() {
        #expect(!ListColumnLayout.acceptsSystemVisibility(isFolded: true, besideTask: false, shown: .full))
        #expect(!ListColumnLayout.acceptsSystemVisibility(isFolded: false, besideTask: true, shown: .rail))
        #expect(ListColumnLayout.acceptsSystemVisibility(isFolded: false, besideTask: true, shown: .hidden))
        #expect(ListColumnLayout.acceptsSystemVisibility(isFolded: false, besideTask: false, shown: .hidden))
    }
}
