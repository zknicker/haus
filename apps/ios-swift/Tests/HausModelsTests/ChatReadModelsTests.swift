import Foundation
import XCTest
@testable import HausModels

final class ChatReadModelsTests: XCTestCase {
    func testReadInputUsesServerContractWireNames() throws {
        let input = ChatReadInput(chatID: "chat_product", sequence: 42, serverID: "srv_main")
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(input)) as? [String: Any]
        )

        XCTAssertEqual(Set(object.keys), ["chatId", "sequence", "serverId"])
        XCTAssertEqual(object["chatId"] as? String, "chat_product")
        XCTAssertEqual(object["sequence"] as? Int, 42)
        XCTAssertEqual(object["serverId"] as? String, "srv_main")
    }

    func testReadReceiptDecodesWhetherTheMarkerAdvanced() throws {
        let receipt = try JSONDecoder().decode(
            ChatReadReceipt.self,
            from: Data(#"{"advanced":false,"chatId":"chat_product","sequence":42,"serverId":"srv_main"}"#.utf8)
        )

        XCTAssertEqual(receipt, ChatReadReceipt(
            advanced: false,
            chatID: "chat_product",
            sequence: 42,
            serverID: "srv_main"
        ))
    }

    func testReadReceiptWithoutAdvancedIsRejected() {
        XCTAssertThrowsError(try JSONDecoder().decode(
            ChatReadReceipt.self,
            from: Data(#"{"chatId":"chat_product","eventCursor":"9","sequence":42,"serverId":"srv_main"}"#.utf8)
        ))
    }
}
