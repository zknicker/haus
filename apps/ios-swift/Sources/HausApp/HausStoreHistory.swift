import Foundation
import HausModels
import HausUI
import OSLog

struct ChatHistoryNavigationState {
    var requests = ChatHistoryRequests()
    var followingLatest: [String: Bool] = [:]
    var visibleSequences: [String: Int] = [:]
    var retention = ChatHistoryRetention()
    var inlineRetention = ChatHistoryRetention()
}

enum ChatHistoryLoad {
    case refresh, older, newer, latest, around(String)
}

extension HausStore {
    func hasLoadedMessageHistory(chatID: String) -> Bool { messagesByChatID[chatID] != nil }
    func hasOlderMessages(chatID: String) -> Bool { messagesByChatID[chatID]?.nextBeforeSequence != nil }

    func messageHistory(chatID: String) -> MessageHistoryNavigation {
        MessageHistoryNavigation(
            hasOlder: hasOlderMessages(chatID: chatID),
            hasNewer: messagesByChatID[chatID]?.nextAfterSequence != nil,
            isLoading: historyLoadsInFlight.contains(chatID),
            followsLatest: historyNavigation.followingLatest[chatID] ?? true,
            loadOlder: { await self.loadHistory(chatID: chatID, direction: .older) },
            loadNewer: { await self.loadHistory(chatID: chatID, direction: .newer) },
            loadLatest: {
                guard await self.loadHistory(chatID: chatID, direction: .latest) else { return nil }
                return self.messagesByChatID[chatID]?.messages.last?.id
            },
            loadAround: { await self.loadHistory(chatID: chatID, direction: .around($0)) }
        )
    }

    func loadMessages(chatID: String) async {
        guard let serverID = activeServer?.id else { return }
        async let work: Void = loadCloudAgentWork(serverID: serverID, chatID: chatID)
        await loadHistory(chatID: chatID, direction: .refresh)
        await work
        if messagesByChatID[chatID] == nil, openChatID != chatID, canvasChatID != chatID {
            cloudAgentWorkByChatID.removeValue(forKey: chatID)
        }
    }

    @discardableResult
    func loadHistory(chatID: String, direction: ChatHistoryLoad) async -> Bool {
        guard let serverID = activeServer?.id else { return false }
        let current = messagesByChatID[chatID]
        var before: Int?
        var after: Int?
        var around: String?
        switch direction {
        case .older:
            guard let cursor = current?.nextBeforeSequence else { return false }
            before = cursor
        case .newer:
            guard let cursor = current?.nextAfterSequence else { return false }
            after = cursor
        case .around(let id): around = id
        case .refresh, .latest: break
        }
        let policy: ChatHistoryRequests.Policy = switch direction {
        case .refresh: .refresh
        case .older, .newer: .page
        case .latest, .around: .navigate
        }
        guard let ticket = historyNavigation.requests.begin(chatID: chatID, policy: policy) else { return false }
        historyLoadsInFlight.insert(chatID)
        let readToken = agentMessageRecovery.beginRead(serverID: serverID, chatID: chatID)
        defer {
            if let refresh = historyNavigation.requests.finish(ticket, chatID: chatID) {
                historyLoadsInFlight.remove(chatID)
                if refresh {
                    Task { await self.loadMessages(chatID: chatID) }
                }
                trimMessageHistoryCache()
            }
        }
        do {
            let page: ChatMessagePage = try await client.query(
                "chat.messages", input: ChatMessagesInput(
                    serverId: serverID, chatId: chatID, limit: ChatHistoryWindow.defaultPageSize,
                    beforeSequence: before, afterSequence: after, aroundMessageId: around
                )
            )
            guard !Task.isCancelled, activeServer?.id == serverID,
                  agentMessageRecovery.accepts(readToken, activeServerID: activeServer?.id),
                  historyNavigation.requests.isCurrent(ticket, chatID: chatID) else {
                return false
            }
            var window = ChatHistoryWindow(page: messagesByChatID[chatID] ?? page)
            switch direction {
            case .older:
                window.prepend(page)
                historyNavigation.followingLatest[chatID] = false
            case .newer:
                window.append(page)
                historyNavigation.followingLatest[chatID] = false
            case .refresh:
                window.refresh(latest: page, followingLatest: historyNavigation.followingLatest[chatID] ?? true)
            case .latest:
                window.replace(with: page)
                historyNavigation.followingLatest[chatID] = true
            case .around:
                window.replace(with: page)
                historyNavigation.followingLatest[chatID] = false
            }
            messagesByChatID[chatID] = window.page
            reconcilePendingMessages(chatID: chatID, page: page)
            historyNavigation.retention.touch(chatID)
            return true
        } catch is CancellationError {
            return false
        } catch {
            guard agentMessageRecovery.accepts(readToken, activeServerID: activeServer?.id),
                  historyNavigation.requests.isCurrent(ticket, chatID: chatID) else { return false }
            sendError = error.localizedDescription
            Self.logger.error("Loading history failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    func trimMessageHistoryCache() {
        let protected = Set([openChatID, canvasChatID].compactMap { $0 })
            .union(pendingMessagesByChatID.keys).union(historyLoadsInFlight)
        let evictions = historyNavigation.retention.evictions(
            cachedIDs: Set(messagesByChatID.keys), protectedIDs: protected
        )
        for chatID in evictions {
            messagesByChatID.removeValue(forKey: chatID)
            cloudAgentWorkByChatID.removeValue(forKey: chatID)
            historyNavigation.followingLatest.removeValue(forKey: chatID)
            historyNavigation.visibleSequences.removeValue(forKey: chatID)
            for rootID in inlineReplyChatIDByRootID.keys.filter({ inlineReplyChatIDByRootID[$0] == chatID }) {
                inlineReplyPagesByRootID.removeValue(forKey: rootID)
                inlineReplyChatIDByRootID.removeValue(forKey: rootID)
            }
        }
    }

    func advanceHistoryViewport(chatID: String, messageIDs: [String]) {
        guard let page = messagesByChatID[chatID], !messageIDs.isEmpty else { return }
        let visible = Set(messageIDs)
        let indices = page.messages.indices.filter { visible.contains(page.messages[$0].id) }
        guard let first = indices.first, let last = indices.last else { return }
        historyNavigation.followingLatest[chatID] = page.nextAfterSequence == nil && last == page.messages.count - 1
        let sequence = page.messages[first].sequence
        let previous = historyNavigation.visibleSequences.updateValue(sequence, forKey: chatID)
        guard openChatID == chatID, let previous, previous != sequence else { return }
        if sequence < previous, first < 5, page.nextBeforeSequence != nil {
            Task { await self.loadHistory(chatID: chatID, direction: .older) }
        } else if sequence > previous, last >= page.messages.count - 5, page.nextAfterSequence != nil {
            Task { await self.loadHistory(chatID: chatID, direction: .newer) }
        }
    }
}
