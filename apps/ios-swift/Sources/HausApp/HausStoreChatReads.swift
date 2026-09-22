import Foundation
import HausModels
import OSLog

private let readStateLogger = Logger(
    subsystem: "chat.haus.ios",
    category: "chat-read"
)

/// Read acknowledgement: what the open transcript is showing, and what of that
/// Server has been told about. The rule the phone follows is the web App's —
/// see `ChatReadLedger`.
extension HausStore {

    /// Loads the selected Chat and acknowledges whatever of it is already on
    /// screen. Unselected cached Chats stay unread.
    func openChat(chatID: String) async {
        openChatID = chatID
        await loadMessages(chatID: chatID)
        await markChatReadIfNeeded(chatID: chatID)
    }

    /// Records what a transcript currently has in its viewport.
    ///
    /// This is the only thing that moves a Chat's read mark forward. The
    /// transcript reports row ids because that is all a presentation row knows;
    /// sequences are Server's, and live on the loaded page here.
    ///
    /// Every mounted transcript reports, including a canvas Chat a pushed
    /// Thread is covering — its rows are still what a pop returns to. Only the
    /// deepest surface acknowledges, which is the gate in
    /// `markChatReadIfNeeded`.
    func reportVisibleMessages(chatID: String, messageIDs: [String]) {
        advanceHistoryViewport(chatID: chatID, messageIDs: messageIDs)
        guard let serverID = activeServer?.id,
              let sequence = highestVisibleSequence(chatID: chatID, messageIDs: messageIDs)
        else { return }

        let scope = ChatReadScope(serverID: serverID, chatID: chatID)
        let previous = chatReads.visibleHighWater(scope)
        let raised = chatReads.observeVisible(scope, sequence: sequence)
        guard raised != previous, openChatID == chatID else { return }
        Task { await markChatReadIfNeeded(chatID: chatID) }
    }

    /// The app entering or leaving the foreground. Returning re-evaluates the
    /// open Chat, so the mark the reader was looking at when the phone locked
    /// lands as soon as they come back.
    func setForegrounded(_ foregrounded: Bool) async {
        guard isForegrounded != foregrounded else { return }
        isForegrounded = foregrounded
        guard foregrounded, let openChatID else { return }
        await markChatReadIfNeeded(chatID: openChatID)
    }

    /// Acknowledges the highest sequence this Chat has actually shown, while
    /// it is the deepest open surface and the app is frontmost.
    ///
    /// The rule is the web App's, not a mobile variant: `chat.markRead` fires
    /// for the highest *visible* sequence, never for merely-loaded history,
    /// never backwards, once per `(chat, sequence)`, and again after a failure.
    /// `ChatReadLedger` owns all four; this owns the mutation and the surface
    /// gate.
    ///
    /// The durable `chat.read` event owns the Chat-list refresh, exactly as the
    /// web App's `useChatRead` does. Server writes that event only when the read
    /// actually moved, addresses it to the reader alone, and both live delivery
    /// and the reconnect walk carry it, so one acknowledgement produces one list
    /// refresh. Refreshing here as well made every opened Chat refetch twice.
    func markChatReadIfNeeded(chatID: String) async {
        guard let serverID = activeServer?.id, openChatID == chatID else { return }

        let scope = ChatReadScope(serverID: serverID, chatID: chatID)
        guard let request = chatReads.pendingAcknowledgement(
            scope,
            foregrounded: isForegrounded
        ) else { return }
        guard chatReads.begin(request) else { return }

        do {
            let receipt: ChatReadReceipt = try await client.mutation(
                "chat.markRead",
                input: ChatReadInput(
                    chatID: chatID,
                    sequence: request.sequence,
                    serverID: serverID
                )
            )
            chatReads.succeed(request, sequence: receipt.sequence)

            // A newer row can scroll into view while the mutation is in flight.
            // Match the view-key effect by immediately acknowledging it.
            guard activeServer?.id == serverID, openChatID == chatID else { return }
            if chatReads.pendingAcknowledgement(scope, foregrounded: isForegrounded) != nil {
                await markChatReadIfNeeded(chatID: chatID)
            }
        } catch is CancellationError {
            // Releases the in-flight claim without advancing the mark, so the
            // next visibility change or foreground retries this sequence.
            chatReads.fail(request)
        } catch {
            chatReads.fail(request)
            readStateLogger.error(
                "Marking Chat read failed: \(error.localizedDescription, privacy: .public)"
            )
        }
    }

    /// The highest Server sequence among the reported rows. Rows the loaded
    /// page cannot name — a Thread's anchor, task metadata, an optimistic send
    /// — carry no sequence and are simply absent from the map.
    private func highestVisibleSequence(chatID: String, messageIDs: [String]) -> Int? {
        guard !messageIDs.isEmpty, let page = messagesByChatID[chatID] else { return nil }
        let sequenceByMessageID = Dictionary(
            page.messages.map { ($0.id, $0.sequence) },
            uniquingKeysWith: max
        )
        return ChatReadVisibility.highestVisibleSequence(
            visibleMessageIDs: messageIDs,
            sequenceByMessageID: sequenceByMessageID
        )
    }

}
