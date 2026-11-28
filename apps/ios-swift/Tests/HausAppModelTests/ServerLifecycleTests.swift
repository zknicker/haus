import Foundation
import HausModels
import HausTransport
import Testing
@testable import HausAppModel

@MainActor
@Suite("Server lifecycle")
struct ServerLifecycleTests {
    private let a = AppModelFixtures.server("srv_a", name: "Alpha")
    private let b = AppModelFixtures.server("srv_b", name: "Beta")
    private let defaults = AppModelFixtures.defaults()
    private let directory = AppModelFixtures.temporaryDirectory()

    private func lifecycle(userID: String = "user_1") -> ServerLifecycle<StagedFiles> {
        ServerLifecycle(
            userID: userID,
            scope: ServerScope(),
            preference: ActiveServerPreference(userID: userID, defaults: defaults),
            launchSnapshots: LaunchSnapshotStore(directoryURL: directory, appProtocolVersion: HausAppProtocol.version),
            listColumns: ListColumnPreference(userID: userID, defaults: defaults),
            drafts: ComposerDraftStore(makeStaged: StagedFiles.init, discardStaged: { $0.discarded = true })
        )
    }

    @Test("Offline, a cold launch paints the persisted Server's snapshot and never another's")
    func offlineFirstPaint() async throws {
        let first = lifecycle()
        try await first.launchSnapshots.save(AppModelFixtures.snapshot(userID: "user_1", serverID: "srv_a", servers: [a, b]))
        try await first.launchSnapshots.save(AppModelFixtures.snapshot(userID: "user_1", serverID: "srv_b", servers: [a, b]))
        first.activate("srv_b")

        let relaunch = lifecycle()
        let painted = try #require(await relaunch.launchSnapshot())

        #expect(painted.serverID == "srv_b")
        #expect(relaunch.scope.serverID == nil)
    }

    @Test("Without a persisted Server there is nothing to paint")
    func noChoiceNoPaint() async throws {
        let first = lifecycle()
        try await first.launchSnapshots.save(AppModelFixtures.snapshot(userID: "user_1", serverID: "srv_a", servers: [a]))

        #expect(await lifecycle().launchSnapshot() == nil)
    }

    @Test("A live list that leads with another Server keeps the persisted one")
    func adoptionKeepsChoice() {
        let launch = lifecycle()
        launch.preference.save("srv_b")

        #expect(launch.adopt([a, b]) == .activated("srv_b", previous: nil))
        #expect(launch.adopt([a, b]) == .kept("srv_b"))
        #expect(launch.scope.serverID == "srv_b")
    }

    @Test("A switch during a refresh drops the refresh's late answer")
    func switchDuringRefresh() throws {
        let launch = lifecycle()
        #expect(launch.adopt([a, b]) == .activated("srv_a", previous: nil))
        let tasks = TasksModel(client: AppModelFixtures.client, scope: launch.scope)
        let activeRead = try tasks.beginActiveTasksRead()
        let listRead = try tasks.beginListRead(archived: false)

        launch.activate("srv_b")

        #expect(!tasks.landActiveTasks([AppModelFixtures.task("task_1")], for: activeRead))
        #expect(!tasks.landList([AppModelFixtures.task("task_1")], for: listRead, archived: false))
        #expect(tasks.activeTasks == nil)
        #expect(tasks.list == nil)
        #expect(launch.preference.serverID == "srv_b")
    }

    @Test("Membership loss clears that Server's paint and drafts, and only that Server's")
    func membershipLoss() async throws {
        let launch = lifecycle()
        try await launch.launchSnapshots.save(AppModelFixtures.snapshot(userID: "user_1", serverID: "srv_a", servers: [a, b]))
        try await launch.launchSnapshots.save(AppModelFixtures.snapshot(userID: "user_1", serverID: "srv_b", servers: [a, b]))
        let lostDraft = ComposerDraftKey(serverID: "srv_b", destination: .task("task_1"))
        let keptDraft = ComposerDraftKey(serverID: "srv_a", destination: .task("task_1"))
        launch.drafts.setText("lost", for: lostDraft)
        launch.drafts.setText("kept", for: keptDraft)
        launch.listColumns.save(.rail, serverID: "srv_a")
        launch.listColumns.save(.hidden, serverID: "srv_b")
        launch.activate("srv_b")

        await launch.membershipLost("srv_b")

        #expect(launch.listColumns.columns == ["srv_a": .rail])
        #expect(launch.scope.serverID == nil)
        #expect(launch.preference.serverID == nil)
        #expect(launch.drafts.text(for: lostDraft).isEmpty)
        #expect(launch.drafts.text(for: keptDraft) == "kept")
        #expect(await launch.launchSnapshots.load(userID: "user_1", serverID: "srv_b") == nil)
        #expect(await launch.launchSnapshots.load(userID: "user_1", serverID: "srv_a") != nil)
        #expect(launch.adopt([a]) == .activated("srv_a", previous: nil))
    }

    @Test("Sign-out leaves nothing of the account for the next one to paint or type into")
    func signOutIsolation() async throws {
        let first = lifecycle(userID: "user_1")
        try await first.launchSnapshots.save(AppModelFixtures.snapshot(userID: "user_1", serverID: "srv_a", servers: [a]))
        first.activate("srv_a")
        let key = ComposerDraftKey(serverID: "srv_a", destination: .task("tsk_1"))
        first.drafts.setText("secret", for: key)
        let staged = first.drafts.staged(for: key)
        first.listColumns.save(.rail, serverID: "srv_a")

        await first.signOut()

        #expect(lifecycle(userID: "user_1").listColumns.column(serverID: "srv_a") == .full)
        #expect(staged.discarded)
        #expect(first.drafts.texts.isEmpty)
        #expect(first.preference.serverID == nil)
        #expect(await lifecycle(userID: "user_1").launchSnapshot() == nil)
        let next = lifecycle(userID: "user_2")
        #expect(next.preference.serverID == nil)
        #expect(await next.launchSnapshots.load(userID: "user_1", serverID: "srv_a") == nil)
    }

    @Test("Another user's persisted Server is not this user's")
    func preferenceIsPerUser() {
        lifecycle(userID: "user_1").activate("srv_b")

        #expect(lifecycle(userID: "user_2").preference.serverID == nil)
    }
}
