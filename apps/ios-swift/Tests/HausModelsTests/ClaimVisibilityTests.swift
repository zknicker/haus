import XCTest
@testable import HausModels

final class ClaimVisibilityTests: XCTestCase {
    func testHidesAnAgentsOwnClaimByDefault() {
        XCTAssertFalse(ClaimVisibility.visibleInChat(origin: .claimed, showClaimsInChat: false))
    }

    func testShowsAClaimOnceTheReaderAsksForClaims() {
        XCTAssertTrue(ClaimVisibility.visibleInChat(origin: .claimed, showClaimsInChat: true))
    }

    func testAlwaysShowsAClaimAHumanMade() {
        for origin in [ClaimOrigin.composed, .converted] {
            XCTAssertTrue(ClaimVisibility.visibleInChat(origin: origin, showClaimsInChat: false))
            XCTAssertTrue(ClaimVisibility.visibleInChat(origin: origin, showClaimsInChat: true))
        }
    }
}
