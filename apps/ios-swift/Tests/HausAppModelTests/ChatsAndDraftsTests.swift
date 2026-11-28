import HausModels
import Testing
@testable import HausAppModel

@MainActor
@Suite("Chats model and composer drafts")
struct ChatsAndDraftsTests {
    @Test("The Chat list is unknown until it lands, and equal writes report nothing")
    func chatListLoads() {
        let chats = ChatsModel()
        var changes = 0
        chats.onChange = { _ in changes += 1 }
        #expect(chats.unreadChats == nil)

        chats.chats = HausPreviewFixtures.chats
        chats.chats = HausPreviewFixtures.chats

        #expect(chats.hasLoadedChats)
        #expect(chats.unreadChats?.isEmpty == true)
        #expect(changes == 1)
    }

    @Test("Reset makes the list unknown again rather than empty")
    func resetIsUnknown() {
        let chats = ChatsModel()
        chats.chats = HausPreviewFixtures.chats
        chats.markedReadThrough["chat_all"] = 1
        chats.reset()

        #expect(chats.chats.isEmpty)
        #expect(chats.unreadChats == nil)
        #expect(chats.markedReadThrough.isEmpty)
    }

    @Test("A draft is keyed by Server and destination")
    func draftsAreServerScoped() {
        let drafts = ComposerDraftStore(makeStaged: StagedFiles.init, discardStaged: { $0.discarded = true })
        let taskOnA = ComposerDraftKey(serverID: "srv_a", destination: .task("task_1"))
        let taskOnB = ComposerDraftKey(serverID: "srv_b", destination: .task("task_1"))

        drafts.setText("Ship it", for: taskOnA)

        #expect(drafts.text(for: taskOnA) == "Ship it")
        #expect(drafts.text(for: taskOnB).isEmpty)
    }

    @Test("Staged files outlive a remount and go with their Server")
    func stagedFilesClearPerServer() {
        let drafts = ComposerDraftStore(makeStaged: StagedFiles.init, discardStaged: { $0.discarded = true })
        let task = ComposerDraftKey(serverID: "srv_a", destination: .task("tsk_1"))
        let other = ComposerDraftKey(serverID: "srv_b", destination: .chat("chat_1"))
        let staged = drafts.staged(for: task)
        staged.names.append("photo.jpg")
        drafts.setText("Also check CI", for: task)
        drafts.setText("Keep", for: other)

        #expect(drafts.staged(for: task) === staged)

        drafts.clear(serverID: "srv_a")

        #expect(staged.discarded)
        #expect(!drafts.hasStaged(for: task))
        #expect(drafts.text(for: task).isEmpty)
        #expect(drafts.text(for: other) == "Keep")
    }

    @Test("An emptied draft is forgotten")
    func emptyDraftIsRemoved() {
        let drafts = ComposerDraftStore(makeStaged: StagedFiles.init, discardStaged: { _ in })
        let key = ComposerDraftKey(serverID: "srv_a", destination: .chat("chat_1"))
        drafts.setText("x", for: key)
        drafts.setText("", for: key)

        #expect(drafts.texts.isEmpty)
    }
}
