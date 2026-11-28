import Foundation
import Testing
@testable import HausUI

@MainActor
struct PoseCarryTests {
    private let transcript = PoseKey(scope: "/home/channel", name: "transcript")
    private let sheet = PoseKey(scope: "/home/channel", name: "turnDetails")

    @Test func aScreenMountedAfterTheFoldTakesBackWhatTheOldOneHeld() {
        let carry = PoseCarry()
        let old = UUID()
        let resting = Resting(anchor: "msg_12")
        carry.register(transcript, token: old) { resting.anchor }
        resting.anchor = "msg_14"

        carry.carry()
        carry.unregister(token: old)

        #expect(carry.take(transcript, as: String.self) == "msg_14")
        #expect(carry.take(transcript, as: String.self) == nil)
    }

    @Test func nothingIsCarriedForAScreenResting() {
        let carry = PoseCarry()
        carry.register(transcript, token: UUID()) { nil }
        carry.carry()
        #expect(carry.take(transcript, as: String.self) == nil)
    }

    @Test func anOldScreenLeavingAfterItsReplacementArrivedLeavesTheReplacement() {
        let carry = PoseCarry()
        let old = UUID()
        carry.register(sheet, token: old) { "turn_1" }
        carry.register(sheet, token: UUID()) { "turn_2" }
        carry.unregister(token: old)

        carry.carry()
        #expect(carry.take(sheet, as: String.self) == "turn_2")
    }

    @Test func theNextPoseChangeDropsWhatNoScreenTook() {
        let carry = PoseCarry()
        let token = UUID()
        carry.register(sheet, token: token) { "turn_1" }
        carry.carry()
        carry.unregister(token: token)

        carry.carry()
        #expect(carry.take(sheet, as: String.self) == nil)
    }

    @Test func aComposerWhoseDraftMovesToTheTaskCarriesFocusForThatDraftOnly() {
        let carry = PoseCarry()
        let screen = UUID()
        let channelDraft = PoseKey(scope: "composer", name: "chat(\"chat_all\")")
        let taskDraft = PoseKey(scope: "composer", name: "task(\"task_1\")")
        carry.register(channelDraft, token: screen) { true }
        carry.register(taskDraft, token: screen) { true }

        carry.carry()
        carry.unregister(token: screen)
        #expect(carry.take(channelDraft, as: Bool.self) == nil)
        #expect(carry.take(taskDraft, as: Bool.self) == true)

        carry.carry()
        #expect(carry.take(taskDraft, as: Bool.self) == nil)
    }

    @Test func navigatingAfterAFoldDropsWhatNoScreenTook() {
        let carry = PoseCarry()
        let focus = PoseKey(scope: "composer", name: "chat(\"chat_all\")")
        let screen = UUID()
        carry.register(focus, token: screen) { true }
        carry.carry()
        carry.unregister(token: screen)

        carry.settle()
        #expect(carry.take(focus, as: Bool.self) == nil)
    }

    @Test func aValueOfAnotherTypeIsNotTaken() {
        let carry = PoseCarry()
        carry.register(sheet, token: UUID()) { true }
        carry.carry()
        #expect(carry.take(sheet, as: String.self) == nil)
    }
}

@MainActor
private final class Resting {
    var anchor: String

    init(anchor: String) {
        self.anchor = anchor
    }
}
