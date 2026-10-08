import Foundation
@testable import HausModels
@testable import HausUI
import Testing

/// The Reminder or Trigger line above a caused message (the App's
/// `MessageCauseLine` and `TurnContext`).
struct MessageCauseLineTests {
    @Test func presentsAReminderAndATrigger() throws {
        let reminder = try #require(MessageCausePresentation(cause(kind: .reminder, title: " Morning check ")))
        #expect(reminder == MessageCausePresentation(kind: .reminder, title: "Morning check"))
        #expect(reminder.glyph == .reminder)
        #expect(reminder.accessibilityLabel == "Reminder: Morning check")

        let trigger = try #require(MessageCausePresentation(cause(kind: .trigger, title: "Deploy finished")))
        #expect(trigger.glyph == .trigger)
        #expect(trigger.accessibilityLabel == "Trigger: Deploy finished")
    }

    @Test func anUnknownKindDrawsNoLine() {
        #expect(MessageCausePresentation(cause(kind: .unknown("webhook"), title: "Inbound")) == nil)
    }

    /// The line sits above the caused message's identity, so a caused message
    /// never continues the block above it, even from the same Agent.
    @Test func aCausedMessageOpensItsOwnBlock() {
        let agent = MessageAuthorPresentation(id: "agent_1", name: "Cove", avatarURL: nil)
        let start = Date(timeIntervalSince1970: 0)
        let earlier = MessagePresentation(id: "m1", author: agent, content: "Earlier", createdAt: start)
        let caused = MessagePresentation(
            id: "m2",
            author: agent,
            content: "Morning check: all green.",
            createdAt: start.addingTimeInterval(30),
            cause: MessageCausePresentation(kind: .reminder, title: "Morning check")
        )
        let plain = MessagePresentation(id: "m3", author: agent, content: "Also", createdAt: start.addingTimeInterval(40))

        #expect(!TranscriptRowGrouping(caused, after: earlier).isContinuation)
        #expect(TranscriptRowGrouping(plain, after: caused).isContinuation)
    }

    private func cause(kind: ChatMessageCause.Kind, title: String) -> ChatMessageCause {
        ChatMessageCause(
            attribution: "explicit",
            automationID: "automation_1",
            description: nil,
            firedAt: Date(timeIntervalSince1970: 0),
            fireID: "fire_1",
            kind: kind,
            live: nil,
            ownerAgentID: "agent_1",
            summary: "Every weekday at 09:00",
            title: title
        )
    }
}
