import Foundation
import XCTest
@testable import HausModels

final class AutomationFormattingTests: XCTestCase {
    private let now = iso("2026-10-08T16:00:00.000Z")

    func testTriggerActivitySaysNeverFiredOnceAndCountsFires() {
        XCTAssertEqual(AutomationFormatting.triggerActivity(fireCount: 0, lastFiredAt: nil, now: now), "Never fired")
        XCTAssertEqual(
            AutomationFormatting.triggerActivity(fireCount: 4, lastFiredAt: now.addingTimeInterval(-3 * 3_600), now: now),
            "Last fired 3h ago · 4 fires"
        )
        XCTAssertEqual(
            AutomationFormatting.triggerActivity(fireCount: 1, lastFiredAt: now.addingTimeInterval(-60), now: now),
            "Last fired just now · 1 fire"
        )
    }

    func testOnlyADisabledOrDegradedTriggerCarriesABadge() {
        XCTAssertNil(AutomationFormatting.triggerRowStatus(trigger(status: .armed)))
        XCTAssertEqual(AutomationFormatting.triggerRowStatus(trigger(status: .disabled)), "Disabled")
        let healthy = trigger(github: .init(installationLogin: "acme"), kind: "github")
        XCTAssertNil(AutomationFormatting.triggerRowStatus(healthy))
        let degraded = trigger(github: .init(installationLogin: "acme", problem: "sign_in_required"), kind: "github")
        XCTAssertEqual(AutomationFormatting.triggerRowStatus(degraded), "Sign in required")
        let disabled = trigger(
            github: .init(installationLogin: "acme", problem: "installation_removed"),
            kind: "github",
            status: .disabled
        )
        XCTAssertEqual(AutomationFormatting.triggerRowStatus(disabled), "Disabled")
    }

    func testGitHubTriggersReadAsGitHubAndNeverOfferARotate() {
        XCTAssertEqual(AutomationFormatting.triggerKindLabel("github"), "GitHub trigger")
        XCTAssertEqual(AutomationFormatting.triggerKindLabel("webhook"), "Webhook trigger")
        XCTAssertFalse(AutomationFormatting.triggerFooter("github").contains("secret"))
        XCTAssertTrue(AutomationFormatting.triggerFooter("webhook").contains("rotate the secret"))
        XCTAssertEqual(AutomationFormatting.githubProblemTitle("something_new"), "Not firing")
    }

    func testAGitHubTriggerDecodesItsLoginAndProblem() throws {
        let json = """
        {"anchorChatId":"chat_1","anchorMessageId":null,"createdAt":"2026-10-08T16:00:00.000Z",
         "createdByHandle":null,"createdByUserId":null,"disabledAt":null,"fireCount":0,"id":"trg_1",
         "instruction":null,"kind":"github","lastFiredAt":null,"ownerAgentId":"agent_1",
         "ownerHandle":"blippy","status":"armed","title":"CI failed","updatedAt":"2026-10-08T16:00:00.000Z",
         "version":1,"github":{"events":[{"event":"push"}],"installationId":"ghi_1",
         "installationLogin":"acme","problem":"permissions_missing","problemSince":null,
         "repositories":{"scope":"installation"},"suppressedCount":0}}
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            try iso(decoder.singleValueContainer().decode(String.self))
        }
        let decoded = try decoder.decode(Trigger.self, from: Data(json.utf8))
        XCTAssertEqual(decoded.github, .init(installationLogin: "acme", problem: "permissions_missing"))
    }

    private func trigger(
        github: Trigger.GitHub? = nil,
        kind: String = "webhook",
        status: Trigger.Status = .armed
    ) -> Trigger {
        Trigger(
            anchorChatID: "chat_1", createdAt: now, github: github, id: "trg_1",
            kind: kind, status: status, title: "CI failed"
        )
    }

    func testRelativeTimeMatchesTheAppBuckets() {
        XCTAssertEqual(AutomationFormatting.relativeTime(now.addingTimeInterval(-5 * 60), now: now), "5m ago")
        XCTAssertEqual(AutomationFormatting.relativeTime(now.addingTimeInterval(-36 * 3_600), now: now), "2d ago")
        XCTAssertEqual(AutomationFormatting.relativeTime(now.addingTimeInterval(60), now: now), "just now")
    }

    func testCreatorIsTheHumanHandleOrTheOwningAgent() {
        XCTAssertEqual(AutomationFormatting.triggerCreator(handle: "zach", ownerName: "Blippy"), "@zach")
        XCTAssertEqual(AutomationFormatting.triggerCreator(handle: nil, ownerName: "Blippy"), "Blippy")
    }

    func testFireDetailSkipsWhatTheSenderNeverSupplied() {
        let bare = TriggerFire(contentType: nil, dedupeKey: nil, id: "f", payloadBytes: 1, receivedAt: now)
        XCTAssertEqual(AutomationFormatting.triggerFireDetail(bare), "1 byte")
        let full = TriggerFire(contentType: "application/json", dedupeKey: "abc", id: "f", payloadBytes: 2_048, receivedAt: now)
        XCTAssertEqual(AutomationFormatting.triggerFireDetail(full), "2 KB · application/json · key abc")
    }

    func testByteSizeUsesTheUnitAPersonWouldSay() {
        XCTAssertEqual(AutomationFormatting.byteSize(812), "812 bytes")
        XCTAssertEqual(AutomationFormatting.byteSize(1_300), "1.3 KB")
        XCTAssertEqual(AutomationFormatting.byteSize(16_384), "16 KB")
    }

    func testRunDelayStaysQuietWhenOnTime() {
        let scheduled = now
        XCTAssertNil(AutomationFormatting.runDelay(firedAt: scheduled.addingTimeInterval(90), scheduledFor: scheduled))
        XCTAssertEqual(AutomationFormatting.runDelay(firedAt: scheduled.addingTimeInterval(5 * 60), scheduledFor: scheduled), "5m late")
        XCTAssertEqual(AutomationFormatting.runDelay(firedAt: scheduled.addingTimeInterval(3 * 3_600), scheduledFor: scheduled), "3h late")
        XCTAssertEqual(AutomationFormatting.runDelay(firedAt: scheduled.addingTimeInterval(72 * 3_600), scheduledFor: scheduled), "3d late")
    }

    func testScheduleListsOnlyWakesStillComing() throws {
        let json = """
        [{"anchorChatId":"chat_1","anchorMessageId":"msg_1","createdAt":"2026-10-01T00:00:00.000Z",
          "description":null,"fireAt":"2026-10-12T19:57:00.000Z","hasScript":true,"id":"rem_1",
          "ownerAgentId":"agent_1","ownerHandle":"blippy","repeat":"weekly:mon@15:57","scriptBytes":1300,
          "status":"scheduled","timezone":"America/New_York","title":"Digest",
          "updatedAt":"2026-10-01T00:00:00.000Z","version":3},
         {"anchorChatId":"chat_1","anchorMessageId":"msg_2","createdAt":"2026-10-01T00:00:00.000Z",
          "description":"Done","fireAt":"2026-10-02T00:00:00.000Z","hasScript":false,"id":"rem_2",
          "ownerAgentId":"agent_1","ownerHandle":"blippy","repeat":null,"scriptBytes":0,
          "status":"fired","timezone":"UTC","title":"Old","updatedAt":"2026-10-02T00:00:00.000Z","version":2}]
        """
        let reminders = try HausJSON.decoder().decode([Reminder].self, from: Data(json.utf8))
        let scheduled = AutomationFormatting.scheduled(reminders)
        XCTAssertEqual(scheduled.map(\.id), ["rem_1"])
        XCTAssertEqual(scheduled.first?.repeatRule, "weekly:mon@15:57")
        XCTAssertEqual(scheduled.first?.version, 3)
        XCTAssertEqual(scheduled.first?.kind, .recurring)
    }

    func testDecodesATriggerWithNullableFields() throws {
        let json = """
        {"anchorChatId":"chat_1","anchorMessageId":null,"createdAt":"2026-10-01T00:00:00.000Z",
         "createdByHandle":null,"createdByUserId":null,"disabledAt":"2026-10-03T00:00:00.000Z",
         "fireCount":0,"id":"trg_1","instruction":null,"kind":"webhook","lastFiredAt":null,
         "ownerAgentId":"agent_1","ownerHandle":"blippy","status":"disabled","title":"Deploys",
         "updatedAt":"2026-10-03T00:00:00.000Z","url":"https://haus.chat/t/abc","version":2}
        """
        let trigger = try HausJSON.decoder().decode(Trigger.self, from: Data(json.utf8))
        XCTAssertEqual(trigger.status, .disabled)
        XCTAssertNil(trigger.lastFiredAt)
        XCTAssertNil(trigger.createdByHandle)
    }

    func testTimestampsReadInTheViewersSavedZone() {
        let fired = ISO8601DateFormatter().date(from: "2026-09-02T23:30:00Z")!
        let kolkata = AutomationFormatting.timestamp(fired, zone: TimeZone(identifier: "Asia/Kolkata")!, locale: Locale(identifier: "en_US"))
        XCTAssertTrue(kolkata.contains("Sep 3, 2026"), kolkata)
        XCTAssertTrue(kolkata.contains("5:00"), kolkata)
        let pacific = AutomationFormatting.timestamp(fired, zone: TimeZone(identifier: "America/Los_Angeles")!, locale: Locale(identifier: "en_US"))
        XCTAssertTrue(pacific.contains("Sep 2, 2026"), pacific)
        XCTAssertTrue(pacific.contains("4:30"), pacific)
    }
}
