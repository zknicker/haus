import Foundation

/// The Automations screen's small phrasings, ported from the App's
/// `agent-reminder-model.ts`, `agent-trigger-model.ts`, and `lib/format.ts`.
public enum AutomationFormatting {
    /// The section is a schedule, so it lists only the wakes still coming, in
    /// the Server's `fireAt` order. What already happened lives in run history.
    public static func scheduled(_ reminders: [Reminder]) -> [Reminder] {
        reminders.filter { $0.status == .scheduled }
    }

    /// Fire count and last-fired time are the same fact until a Trigger has
    /// fired: "0 fires" adds nothing to "Never fired".
    public static func triggerActivity(fireCount: Int, lastFiredAt: Date?, now: Date = Date()) -> String {
        guard fireCount > 0, let lastFiredAt else { return "Never fired" }
        let fires = fireCount == 1 ? "1 fire" : "\(fireCount) fires"
        return "Last fired \(relativeTime(lastFiredAt, now: now)) · \(fires)"
    }

    /// Armed is the norm and carries no badge; disabled is the one state a row
    /// speaks up about.
    public static func triggerRowStatus(_ status: Trigger.Status) -> String? {
        status == .armed ? nil : "Disabled"
    }

    /// A human author is named by handle; an Agent-created Trigger credits the
    /// Agent that owns it.
    public static func triggerCreator(handle: String?, ownerName: String) -> String {
        handle.map { "@\($0)" } ?? ownerName
    }

    /// One fire's supporting facts, skipping the ones the sender never supplied.
    public static func triggerFireDetail(_ fire: TriggerFire) -> String {
        var parts = [byteSize(fire.payloadBytes)]
        if let contentType = fire.contentType { parts.append(contentType) }
        if let key = fire.dedupeKey { parts.append("key \(key)") }
        return parts.joined(separator: " · ")
    }

    /// How late one run woke, when late enough to matter — a wake that waited
    /// for an offline Agent. On-time runs say nothing.
    public static func runDelay(firedAt: Date, scheduledFor: Date) -> String? {
        let minutes = Int((firedAt.timeIntervalSince(scheduledFor) / 60).rounded(.down))
        if minutes < 2 { return nil }
        if minutes < 60 { return "\(minutes)m late" }
        let hours = minutes / 60
        return hours < 48 ? "\(hours)h late" : "\(hours / 24)d late"
    }

    /// "just now", "5m ago", "3h ago", "2d ago".
    public static func relativeTime(_ date: Date, now: Date = Date()) -> String {
        let minutes = max(0, Int((now.timeIntervalSince(date) / 60).rounded()))
        if minutes < 2 { return "just now" }
        if minutes < 60 { return "\(minutes)m ago" }
        let hours = Int((Double(minutes) / 60).rounded())
        if hours < 24 { return "\(hours)h ago" }
        return "\(Int((Double(hours) / 24).rounded()))d ago"
    }

    /// A byte count in the unit a person would say it in.
    public static func byteSize(_ bytes: Int) -> String {
        if bytes < 1024 { return bytes == 1 ? "1 byte" : "\(bytes) bytes" }
        let kilobytes = Double(bytes) / 1024
        let rounded = kilobytes >= 10 ? kilobytes.rounded() : (kilobytes * 10).rounded() / 10
        let text = rounded == rounded.rounded() ? String(Int(rounded)) : String(rounded)
        return "\(text) KB"
    }

    /// A settled instant, as the detail's Created and history rows show it.
    public static func timestamp(_ date: Date, zone: TimeZone, locale: Locale = .current) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = zone
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}
