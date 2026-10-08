import Foundation
import SwiftUI

/// Speaks new thoughts to VoiceOver politely: a low-priority announcement that
/// never moves focus, and at most one every few seconds, so a busy channel
/// does not talk over the person reading it. Thoughts that arrive inside the
/// window are skipped rather than queued; they are ambient.
@MainActor
final class EngagementAnnouncer {
    static let minimumInterval: TimeInterval = 4

    private var lastAnnouncedAt: TimeInterval?
    private let clock: () -> TimeInterval

    init(clock: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.clock = clock
    }

    func announce(_ text: String) {
        #if os(iOS)
        guard UIAccessibility.isVoiceOverRunning, shouldAnnounce() else { return }
        var message = AttributedString(text)
        message.accessibilitySpeechAnnouncementPriority = .low
        AccessibilityNotification.Announcement(message).post()
        #endif
    }

    /// Whether the throttle lets a line through now; records it when it does.
    func shouldAnnounce() -> Bool {
        let now = clock()
        if let lastAnnouncedAt, now - lastAnnouncedAt < Self.minimumInterval { return false }
        lastAnnouncedAt = now
        return true
    }
}
