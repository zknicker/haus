import Foundation
import XCTest
@testable import HausModels

final class VoiceCallEventsTests: XCTestCase {
    func testDecodesPCMAndRejectsIncompleteSamples() throws {
        let decoder = JSONDecoder()
        XCTAssertEqual(try decoder.decode(VoiceCallEvent.self, from: Data(#"{"type":"audio","audio":"AAA="}"#.utf8)), .audio(Data([0, 0])))
        XCTAssertThrowsError(try decoder.decode(VoiceCallEvent.self, from: Data(#"{"type":"audio","audio":"AQ=="}"#.utf8)))
        XCTAssertThrowsError(try decoder.decode(VoiceCallEvent.self, from: Data(#"{"type":"audio","audio":"!!!!"}"#.utf8)))
    }

    func testEncodesMuteAndCloseWithoutExtraFields() throws {
        let encoder = JSONEncoder()
        let muted = try JSONSerialization.jsonObject(with: encoder.encode(VoiceCallCommand.mute(true))) as? [String: Any]
        XCTAssertEqual(muted?["type"] as? String, "mute")
        XCTAssertEqual(muted?["muted"] as? Bool, true)
        let closed = try JSONSerialization.jsonObject(with: encoder.encode(VoiceCallCommand.close)) as? [String: Any]
        XCTAssertEqual(closed?.count, 1)
        XCTAssertEqual(closed?["type"] as? String, "close")
    }
}
