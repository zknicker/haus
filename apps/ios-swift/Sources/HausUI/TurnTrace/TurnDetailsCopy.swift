import Foundation
import HausModels

/// The words turn details puts on runs and turns.
enum TurnDetailsCopy {
    /// "Working for 1m 42s", from the run's start.
    static func working(since start: Date, now: Date) -> String {
        "Working for \(TraceDuration.elapsed(from: start, to: now))"
    }

    /// "Worked for 48s", or how a turn that did not finish ended.
    static func settled(_ turn: AgentTurn) -> String {
        let duration = TraceDuration.elapsed(from: turn.startedAt, to: turn.endedAt)
        return switch turn.status {
        case .completed: "Worked for \(duration)"
        case .failed: "Failed after \(duration)"
        case .interrupted: "Stopped after \(duration)"
        }
    }

    /// "Yesterday 6:41 PM", or the time alone today.
    static func when(_ date: Date, now: Date = .now, calendar: Calendar = .current, locale: Locale = .current) -> String {
        let day = TranscriptDayLabel.title(for: date, now: now, calendar: calendar, locale: locale)
        var style = Date.FormatStyle(date: .omitted, time: .shortened)
        style.calendar = calendar
        style.timeZone = calendar.timeZone
        style.locale = locale
        let time = date.formatted(style)
        return day == "Today" ? time : "\(day) \(time)"
    }

    /// The settled turn a message belongs to: the newest turn that started before it and ended
    /// close enough after that the message is its reply.
    static func turn(for messageDate: Date, in turns: [AgentTurn], grace: TimeInterval = 120) -> AgentTurn? {
        turns
            .filter { $0.startedAt <= messageDate && messageDate <= $0.endedAt.addingTimeInterval(grace) }
            .max { $0.startedAt < $1.startedAt }
    }
}
