import Foundation
import HausModels
import Observation

/// The typing strip's state for one open Chat: which Agents are answering it,
/// the Agents held until their reply lands, and the thought line on screen.
///
/// The App feeds it (`HausStoreEngagement.swift`): the durable read on every
/// (re)connect, live engagement events, and live thoughts. Everything here is
/// transient — nothing is cached, and the model goes away with the screen.
@MainActor
@Observable
public final class ChatTypingModel {
    /// The live engagements, from the durable read patched by live events.
    public private(set) var engagements: [ChatEngagement] = []
    /// Agents whose `--done` reply has not reached the transcript yet.
    public private(set) var holds: [ChatTypingHold] = []
    private var liveThought: ChatTypingThought?
    private var latestThought: ChatTypingThought?
    private var isRecalling = false

    /// The Chat's loaded transcript, which releases holds. Set by the App.
    @ObservationIgnored public var transcript: @MainActor () -> [ChatMessage] = { [] }
    @ObservationIgnored private let clock: @MainActor () -> TimeInterval
    @ObservationIgnored private var onScreen: ChatTypingThoughtOnScreen?
    @ObservationIgnored private var lastShownAt: TimeInterval?
    @ObservationIgnored private var shownRuns: Set<String> = []
    @ObservationIgnored private var nextThoughtID = 0
    @ObservationIgnored private var thoughtHold: Task<Void, Never>?
    @ObservationIgnored private var thoughtWait: Task<Void, Never>?
    @ObservationIgnored private var holdRelease: Task<Void, Never>?
    @ObservationIgnored private var recallEnd: Task<Void, Never>?

    public init(clock: @escaping @MainActor () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.clock = clock
    }

    /// The engagements the strip shows: live ones first, then held Agents.
    public var shownEngagements: [ChatEngagement] {
        engagements.withHeld(holds)
    }

    /// The thought line to show, or nil. A thought shows only while its run
    /// still engages the Chat; tapping the strip brings the latest back.
    public var shownThought: ChatTypingThought? {
        engaged(liveThought) ?? (isRecalling ? engaged(latestThought) : nil)
    }

    /// Whether a tap has something to bring back.
    public var canRecall: Bool {
        liveThought == nil && engaged(latestThought) != nil
    }

    // MARK: - Engagements

    /// The durable read. The stream never replays, so every (re)connect and
    /// foreground return replaces the list outright.
    public func replace(_ engagements: [ChatEngagement]) {
        guard self.engagements != engagements else { return }
        self.engagements = engagements
        retireDisengagedThoughts()
    }

    /// One live event. An end that removes a run holds its Agent while its
    /// reply is still on the way.
    public func apply(_ event: ChatEngagementEvent) {
        guard let next = engagements.applying(event) else { return }
        engagements = next
        retireDisengagedThoughts()
        if case .ended = event.kind,
           let hold = ChatTypingHold.hold(for: event, messages: transcript(), now: Date()) {
            holds.append(hold)
            scheduleHoldRelease()
        }
    }

    // MARK: - Thoughts

    /// A live thought. Only the run engaging this Chat shows one; newest wins
    /// while a line waits for its turn, and the line already up extends.
    public func receive(_ event: AgentThoughtEvent) {
        nextThoughtID += 1
        guard engagements.engages(agentID: event.agentID, runID: event.runID) else { return }
        let next = ChatTypingThought(
            id: nextThoughtID,
            agentID: event.agentID,
            runID: event.runID,
            text: event.text
        )
        thoughtWait?.cancel()
        let now = clock()
        if ChatTypingThoughtPacing.arrival(of: next, onScreen: onScreen, now: now) != .show {
            present(next)
            return
        }
        let delay = ChatTypingThoughtPacing.delay(
            lastShownAt: lastShownAt,
            now: now,
            firstOfEngagement: !shownRuns.contains(Self.runKey(next))
        )
        guard delay > 0 else {
            present(next)
            return
        }
        thoughtWait = Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled else { return }
            self?.present(next)
        }
    }

    /// Brings the latest thought back for one hold, the phone's stand-in for
    /// the App's hover recall.
    public func recall() {
        guard let latest = engaged(latestThought) else { return }
        isRecalling = true
        recallEnd?.cancel()
        recallEnd = Task { [weak self] in
            try? await Task.sleep(for: .seconds(ChatTypingThoughtPacing.hold(for: latest.text)))
            guard !Task.isCancelled else { return }
            self?.isRecalling = false
        }
    }

    private func present(_ next: ChatTypingThought) {
        let now = clock()
        switch ChatTypingThoughtPacing.arrival(of: next, onScreen: onScreen, now: now) {
        case .absorb:
            return
        case .extend(let hideAt):
            // Not a new line: it keeps its identity, so it does not re-enter.
            guard var current = onScreen else { return }
            current.hideAt = hideAt
            onScreen = current
            scheduleThoughtExit(current.thought, at: hideAt)
        case .show:
            let hideAt = now + ChatTypingThoughtPacing.enter + ChatTypingThoughtPacing.hold(for: next.text)
            lastShownAt = now
            shownRuns.insert(Self.runKey(next))
            onScreen = ChatTypingThoughtOnScreen(thought: next, shownAt: now, hideAt: hideAt)
            liveThought = next
            latestThought = next
            isRecalling = false
            scheduleThoughtExit(next, at: hideAt)
        }
    }

    private func scheduleThoughtExit(_ thought: ChatTypingThought, at hideAt: TimeInterval) {
        thoughtHold?.cancel()
        let wait = max(0, hideAt - clock())
        thoughtHold = Task { [weak self] in
            try? await Task.sleep(for: .seconds(wait))
            guard !Task.isCancelled, let self else { return }
            onScreen = nil
            if liveThought?.id == thought.id { liveThought = nil }
        }
    }

    /// A thought belongs to one engagement: it goes the moment its run stops
    /// engaging the Chat, so a new turn never recalls an old one.
    private func retireDisengagedThoughts() {
        if latestThought != nil, engaged(latestThought) == nil {
            latestThought = nil
            isRecalling = false
        }
        if liveThought != nil, engaged(liveThought) == nil {
            liveThought = nil
            onScreen = nil
        }
    }

    private func engaged(_ thought: ChatTypingThought?) -> ChatTypingThought? {
        guard let thought, engagements.engages(agentID: thought.agentID, runID: thought.runID) else {
            return nil
        }
        return thought
    }

    // MARK: - Holds

    /// Checks held replies against the transcript until each lands or times
    /// out. A hold lasts two seconds at most, so a short poll is the whole
    /// mechanism rather than an observation of the message cache.
    private func scheduleHoldRelease() {
        guard holdRelease == nil else { return }
        holdRelease = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(150))
                guard let self, !Task.isCancelled else { return }
                let messages = transcript()
                let now = Date()
                let kept = holds.filter { !$0.isReleased(messages: messages, now: now) }
                if kept != holds { holds = kept }
                if kept.isEmpty {
                    holdRelease = nil
                    return
                }
            }
        }
    }

    private static func runKey(_ thought: ChatTypingThought) -> String {
        "\(thought.agentID):\(thought.runID)"
    }
}
