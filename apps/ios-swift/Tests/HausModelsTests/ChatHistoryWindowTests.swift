import Foundation
import XCTest
@testable import HausModels

final class ChatHistoryWindowTests: XCTestCase {
    func testMessagePageCarriesAfterCursorAndPrependingKeepsNewestCursor() throws {
        let older = ChatMessagePage(
            messages: [try message(id: "one", sequence: 1)],
            nextBeforeSequence: nil,
            nextAfterSequence: 1
        )
        let newer = ChatMessagePage(
            messages: [try message(id: "two", sequence: 2)],
            nextBeforeSequence: 1,
            nextAfterSequence: nil
        )

        var window = ChatHistoryWindow(page: newer)
        window.prepend(older)
        let merged = window.page

        XCTAssertEqual(merged.messages.map(\.sequence), [1, 2])
        XCTAssertNil(merged.nextAfterSequence)
    }

    func testReplacementDeduplicatesBySequenceAndFreshRowsWin() throws {
        let page = ChatMessagePage(
            messages: [
                try message(id: "three", sequence: 3, content: "fresh"),
                try message(id: "one", sequence: 1),
                try message(id: "old-three", sequence: 3, content: "stale")
            ],
            nextBeforeSequence: nil
        )

        let window = ChatHistoryWindow(page: page, capacity: 200)

        XCTAssertEqual(window.page.messages.map(\.id), ["one", "three"])
        XCTAssertEqual(window.page.messages.last?.content, "fresh")
    }

    func testPrependingAndAppendingEvictTheOppositeEdgeAndRebindCursors() throws {
        let current = ChatMessagePage(
            messages: try (251...400).map { try message(id: "message-\($0)", sequence: $0) },
            nextBeforeSequence: 250,
            nextAfterSequence: 400
        )

        var olderWindow = ChatHistoryWindow(page: current)
        olderWindow.prepend(
            ChatMessagePage(
                messages: try (1...250).map { try message(id: "message-\($0)", sequence: $0) },
                nextBeforeSequence: nil,
                nextAfterSequence: 250
            )
        )
        XCTAssertEqual(olderWindow.page.messages.map(\.sequence), Array(1...200))
        XCTAssertNil(olderWindow.page.nextBeforeSequence)
        XCTAssertEqual(olderWindow.page.nextAfterSequence, 200)

        var newerWindow = ChatHistoryWindow(page: current)
        newerWindow.append(
            ChatMessagePage(
                messages: try (401...650).map { try message(id: "message-\($0)", sequence: $0) },
                nextBeforeSequence: 400,
                nextAfterSequence: nil
            )
        )
        XCTAssertEqual(newerWindow.page.messages.map(\.sequence), Array(451...650))
        XCTAssertEqual(newerWindow.page.nextBeforeSequence, 451)
        XCTAssertNil(newerWindow.page.nextAfterSequence)
    }

    func testRepeatedBackwardsThenForwardsTraversalStaysBoundedAndReloadable() throws {
        var window = ChatHistoryWindow(
            page: ChatMessagePage(
                messages: try (951...1000).map { try message(id: "message-\($0)", sequence: $0) },
                nextBeforeSequence: 950,
                nextAfterSequence: nil
            )
        )

        for upperBound in stride(from: 950, through: 50, by: -50) {
            let lowerBound = upperBound - 49
            window.prepend(
                ChatMessagePage(
                    messages: try (lowerBound...upperBound).map {
                        try message(id: "message-\($0)", sequence: $0)
                    },
                    nextBeforeSequence: lowerBound == 1 ? nil : lowerBound - 1,
                    nextAfterSequence: upperBound
                )
            )
            XCTAssertLessThanOrEqual(window.page.messages.count, ChatHistoryWindow.defaultCapacity)
            XCTAssertEqual(window.page.messages, window.page.messages.sorted { $0.sequence < $1.sequence })
        }

        XCTAssertEqual(window.page.messages.map(\.sequence), Array(1...200))
        XCTAssertEqual(window.page.nextAfterSequence, 200)

        for lowerBound in stride(from: 201, through: 951, by: 50) {
            let upperBound = min(lowerBound + 49, 1000)
            window.append(
                ChatMessagePage(
                    messages: try (lowerBound...upperBound).map {
                        try message(id: "message-\($0)", sequence: $0)
                    },
                    nextBeforeSequence: lowerBound == 201 ? nil : lowerBound - 1,
                    nextAfterSequence: upperBound == 1000 ? nil : upperBound
                )
            )
            XCTAssertLessThanOrEqual(window.page.messages.count, ChatHistoryWindow.defaultCapacity)
            XCTAssertEqual(window.page.messages, window.page.messages.sorted { $0.sequence < $1.sequence })
        }

        XCTAssertEqual(window.page.messages.map(\.sequence), Array(801...1000))
        XCTAssertEqual(window.page.nextBeforeSequence, 801)
        XCTAssertNil(window.page.nextAfterSequence)
    }

    func testOldHistoryRefreshUpdatesOverlapWithoutAppendingDisconnectedLatestRows() throws {
        var window = ChatHistoryWindow(
            page: ChatMessagePage(
                messages: try (101...200).map { try message(id: "message-\($0)", sequence: $0) },
                nextBeforeSequence: 100,
                nextAfterSequence: nil
            )
        )

        window.refresh(
            latest: ChatMessagePage(
                messages: [
                    try message(id: "message-150", sequence: 150, content: "edited"),
                    try message(id: "message-220", sequence: 220)
                ],
                nextBeforeSequence: 219,
                nextAfterSequence: nil
            ),
            followingLatest: false
        )

        XCTAssertEqual(window.page.messages.count, 100)
        XCTAssertEqual(window.page.messages.first?.sequence, 101)
        XCTAssertEqual(window.page.messages.last?.sequence, 200)
        XCTAssertEqual(window.page.messages.first { $0.sequence == 150 }?.content, "edited")
        XCTAssertEqual(window.page.nextBeforeSequence, 100)
        XCTAssertEqual(window.page.nextAfterSequence, 200)
    }

    func testTailRefreshAppendsContiguousRowsAndReplacesASeparatedNewestPage() throws {
        var contiguous = ChatHistoryWindow(
            page: ChatMessagePage(
                messages: try (101...200).map { try message(id: "message-\($0)", sequence: $0) },
                nextBeforeSequence: nil,
                nextAfterSequence: 200
            )
        )
        contiguous.refresh(
            latest: ChatMessagePage(
                messages: try (201...250).map { try message(id: "message-\($0)", sequence: $0) },
                nextBeforeSequence: 200,
                nextAfterSequence: nil
            ),
            followingLatest: true
        )
        XCTAssertEqual(contiguous.page.messages.map(\.sequence), Array(101...250))
        XCTAssertNil(contiguous.page.nextBeforeSequence)
        XCTAssertNil(contiguous.page.nextAfterSequence)

        var separated = ChatHistoryWindow(
            page: ChatMessagePage(
                messages: try (101...200).map { try message(id: "message-\($0)", sequence: $0) },
                nextBeforeSequence: nil,
                nextAfterSequence: 200
            )
        )
        separated.refresh(
            latest: ChatMessagePage(
                messages: try (251...300).map { try message(id: "message-\($0)", sequence: $0) },
                nextBeforeSequence: 250,
                nextAfterSequence: nil
            ),
            followingLatest: true
        )
        XCTAssertEqual(separated.page.messages.map(\.sequence), Array(251...300))
        XCTAssertEqual(separated.page.nextBeforeSequence, 250)
        XCTAssertNil(separated.page.nextAfterSequence)
    }

    func testAroundReplacementDropsTheOldRange() throws {
        var window = ChatHistoryWindow(
            page: ChatMessagePage(
                messages: try (1...50).map { try message(id: "message-\($0)", sequence: $0) },
                nextBeforeSequence: nil,
                nextAfterSequence: 50
            )
        )

        window.replace(
            with: ChatMessagePage(
                messages: try (501...550).map { try message(id: "message-\($0)", sequence: $0) },
                nextBeforeSequence: 500,
                nextAfterSequence: 550
            )
        )

        XCTAssertEqual(window.page.messages.map(\.sequence), Array(501...550))
        XCTAssertEqual(window.page.nextBeforeSequence, 500)
        XCTAssertEqual(window.page.nextAfterSequence, 550)
    }

    private func message(id: String, sequence: Int, content: String = "message") throws -> ChatMessage {
        let json = """
        {
          "attachments": [],
          "author": {"agentId":"agent_cove","kind":"agent"},
          "chatId":"chat_cove",
          "content":"\(content)",
          "createdAt":"2026-01-01T00:00:00Z",
          "id":"\(id)",
          "nonce":"nonce_\(id)",
          "runId":null,
          "sequence":\(sequence),
          "serverId":"server_1"
        }
        """
        return try HausJSON.decoder().decode(ChatMessage.self, from: Data(json.utf8))
    }
}
