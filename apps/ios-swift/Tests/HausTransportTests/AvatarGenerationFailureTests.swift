import Foundation
import XCTest
@testable import HausTransport

final class AvatarGenerationFailureTests: XCTestCase {
    func testMapsEachServerOutcomeToProductCopy() {
        XCTAssertEqual(
            AvatarGenerationFailure.from(trpcError(code: "PRECONDITION_FAILED", status: 412)),
            .notConfigured
        )
        XCTAssertEqual(
            AvatarGenerationFailure.from(trpcError(code: "TOO_MANY_REQUESTS", status: 429)),
            .busy
        )
        XCTAssertEqual(
            AvatarGenerationFailure.from(
                trpcError(
                    code: "FORBIDDEN",
                    status: 403,
                    message: "Cove's product-owned avatar cannot be changed."
                )
            ),
            .notAllowed("Cove's product-owned avatar cannot be changed.")
        )
        XCTAssertEqual(
            AvatarGenerationFailure.from(
                trpcError(
                    code: "NOT_FOUND",
                    status: 404,
                    message: "No active Agent exists with that id."
                )
            ),
            .missingOwner("No active Agent exists with that id.")
        )
        XCTAssertEqual(
            AvatarGenerationFailure.from(trpcError(code: "INTERNAL_SERVER_ERROR", status: 500)),
            .providerFailed
        )
    }

    func testMapsATimedOutOrOfflineRequestToOneReachabilitySentence() {
        XCTAssertEqual(
            AvatarGenerationFailure.from(TRPCClientError.transport("The request timed out.")),
            .unreachable
        )
    }

    func testABusyServerReadsAsARetryInAMoment() {
        XCTAssertEqual(
            AvatarGenerationFailure.busy.localizedDescription,
            "Another avatar is still being drawn. Try again in a moment."
        )
    }

    func testNeverSurfacesARawTransportString() {
        let raw = TRPCError(
            message: "The image provider could not generate an avatar.",
            code: -32603,
            data: .object(["code": .string("INTERNAL_SERVER_ERROR")]),
            httpStatus: 500,
            path: "avatar.generate"
        )

        let described = AvatarGenerationFailure.from(raw).localizedDescription

        XCTAssertFalse(described.contains("tRPC"))
        XCTAssertFalse(described.contains("-32603"))
        XCTAssertTrue(described.hasPrefix("The image provider couldn't finish"))
    }

    private func trpcError(code: String, status: Int, message: String = "Failed") -> TRPCError {
        TRPCError(
            message: message,
            code: -32603,
            data: .object(["code": .string(code)]),
            httpStatus: status,
            path: "avatar.generate"
        )
    }
}
