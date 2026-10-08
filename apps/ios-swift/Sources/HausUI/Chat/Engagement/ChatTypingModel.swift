import Foundation
import HausModels
import Observation

/// The header's engagement state for one open Chat: which Agents are
/// answering it, the Agents held until their reply lands, the thought bubble
/// on screen, and each Agent's latest thought.
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
    /// The one thought bubble on screen, taking turns through `EngagementThoughtQueue`.
    public private(set) var bubble: ChatTypingThought?
    private var latestByAgent: [String: ChatTypingThought] = [:]

    /// The Chat's loaded transcript, which releases holds. Set by the App.
    @ObservationIgnored public var transcript: @MainActor () -> [ChatMessage] = { [] }
    @ObservationIgnored private let clock: @MainActor () -> TimeInterval
    @ObservationIgnored private var queue = EngagementThoughtQueue()
    @ObservationIgnored private var nextThoughtID = 0
    /// When each Agent first appeared in this Chat's header, for a stable row order.
    @ObservationIgnored private var arrival: [String: Int] = [:]
    @ObservationIgnored private var queueWake: Task<Void, Never>?
    @ObservationIgnored private var holdRelease: Task<Void, Never>?

    public init(clock: @escaping @MainActor () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.clock = clock
    }

    /// The engagements the header shows, live and held, in the order their
    /// Agents first appeared, so a held Agent keeps its place in the row.
    public var shownEngagements: [ChatEngagement] {
        let shown = engagements.withHeld(holds)
        return shown.enumerated()
            .sorted { lhs, rhs in
                let left = arrival[lhs.element.agentID] ?? .max
                let right = arrival[rhs.element.agentID] ?? .max
                return left == right ? lhs.offset < rhs.offset : left < right
            }
            .map(\.element)
    }

    /// An Agent's latest thought while it is still in the header, for the
    /// DM subtitle and the Working now sheet.
    public func latestThought(for agentID: String) -> ChatTypingThought? {
        latestByAgent[agentID].flatMap { isPresent($0) ? $0 : nil }
    }

    // MARK: - Engagements

    /// The durable read. The stream never replays, so every (re)connect and
    /// foreground return replaces the list outright.
    public func replace(_ engagements: [ChatEngagement]) {
        guard self.engagements != engagements else { return }
        self.engagements = engagements
        noteArrivals()
        retireDepartedThoughts()
    }

    /// One live event. An end that removes a run holds its Agent while its
    /// reply is still on the way.
    public func apply(_ event: ChatEngagementEvent) {
        guard let next = engagements.applying(event) else { return }
        engagements = next
        noteArrivals()
        if case .ended = event.kind,
           let hold = ChatTypingHold.hold(for: event, messages: transcript(), now: Date()) {
            holds.append(hold)
            scheduleHoldRelease()
        }
        retireDepartedThoughts()
    }

    // MARK: - Thoughts

    /// A live thought. Only the run engaging this Chat shows one; it joins
    /// the bubble queue and becomes its Agent's latest line.
    public func receive(_ event: AgentThoughtEvent) {
        nextThoughtID += 1
        guard engagements.engages(agentID: event.agentID, runID: event.runID) else { return }
        let thought = ChatTypingThought(
            id: nextThoughtID,
            agentID: event.agentID,
            runID: event.runID,
            text: event.text
        )
        latestByAgent[thought.agentID] = thought
        queue.receive(thought, now: clock())
        syncBubble()
    }

    /// A thought belongs to one engagement: it goes the moment its run stops
    /// engaging the Chat, except that the bubble already up stays while its
    /// Agent is held for a `--done` reply.
    private func retireDepartedThoughts() {
        queue.retain(
            engaged: { [engagements] agentID, runID in engagements.engages(agentID: agentID, runID: runID) },
            held: { [holds] agentID, runID in holds.contains { $0.end.agentID == agentID && $0.end.runID == runID } },
            now: clock()
        )
        let kept = latestByAgent.filter { isPresent($0.value) }
        if kept.count != latestByAgent.count { latestByAgent = kept }
        syncBubble()
    }

    private func noteArrivals() {
        for engagement in engagements where arrival[engagement.agentID] == nil {
            arrival[engagement.agentID] = arrival.count
        }
    }

    private func isPresent(_ thought: ChatTypingThought) -> Bool {
        engagements.engages(agentID: thought.agentID, runID: thought.runID)
            || holds.contains { $0.end.agentID == thought.agentID && $0.end.runID == thought.runID }
    }

    /// Publishes the queue's bubble and wakes the queue when its next turn is due.
    private func syncBubble() {
        let current = queue.current?.thought
        if bubble != current { bubble = current }
        queueWake?.cancel()
        guard let wake = queue.nextWake else {
            queueWake = nil
            return
        }
        let delay = max(0, wake - clock())
        queueWake = Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled, let self else { return }
            queue.advance(now: clock())
            syncBubble()
        }
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
                if kept != holds {
                    holds = kept
                    retireDepartedThoughts()
                }
                if kept.isEmpty {
                    holdRelease = nil
                    return
                }
            }
        }
    }
}
