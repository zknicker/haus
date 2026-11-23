import HausAppModel
import HausModels
import HausTransport
import HausUI
import SwiftUI

struct AuthenticatedHausView: View {
    @State var store: HausStore
    @State var router = HausRouter()
    @State var agentCall: AgentCallRequest?
    @State var ask = AskAnythingDraft()
    @State var youTabIcon: Image?
    @State var taskBoardFilter = TaskBoardFilter()
    /// The bottom safe area without the keyboard, for the chrome's clearance.
    @State var deviceBottomInset: CGFloat = 0
    /// iOS reaches `.active` through `.inactive` from both a real suspension and
    /// a Control Center pull or app-switcher peek. Only the first is a stale
    /// cache, so the refresh waits for a phase run that actually backgrounded.
    @State private var hasBackgrounded = false
    /// The opening entrance plays once, on the screen the initial load mounts.
    @State private var openingEntranceFinished = false
    let push = PushNotifications.shared
    @AppStorage("appearancePreference") var appearanceRawValue = AppearancePreference.system.rawValue
    @Environment(\.scenePhase) private var scenePhase

    init(session: AppSession, authClient: NativeAuthClient) {
        _store = State(initialValue: HausStore(session: session, authClient: authClient))
    }

    var body: some View {
        Group {
            switch store.state {
            case .idle, .loading:
                HausOpeningView()
            case .failed(let message):
                ContentUnavailableView {
                    Label("Haus is unavailable", systemImage: "wifi.exclamationmark")
                } description: {
                    VStack(spacing: 4) {
                        Text("Haus couldn't reach your Server. Check your connection and try again.")
                        Text(message)
                            .font(.footnote)
                            .foregroundStyle(.tertiary)
                    }
                } actions: {
                    Button("Try again") { Task { await store.retry() } }
                        .buttonStyle(.borderedProminent)
                }
            case .loaded:
                loadedContent
                    .environment(\.opensWithEntrance, !openingEntranceFinished)
                    .environment(\.reactionStickers, store.reactionStickers)
                    .environment(\.chatEngagementSource, store.chatEngagementSource)
                    .environment(\.stoppedAgentSource, store.stoppedAgentSource)
                    .environment(\.captainStop, store.captainStopControl)
                    .onChange(of: router.topRoute) { openingEntranceFinished = true }
            }
        }
        .task { await store.start() }
        .onAppear(perform: installTranscriptRoutes)
        .sheet(item: $agentCall) { request in AgentCallView(request: request, client: store.client) }
        .onChange(of: scenePhase, initial: true) { _, phase in
            applyReadForeground(phase)
            switch phase {
            case .background:
                hasBackgrounded = true
            case .active:
                Task { await push.clearDelivered(openedChatID: push.viewingChatID) }
                guard hasBackgrounded else {
                    Task { await store.refreshIconBadge() }
                    return
                }
                hasBackgrounded = false
                Task {
                    await store.resumeAfterForeground()
                    await push.refreshAuthorization()
                }
            default:
                break
            }
        }
    }

    private var loadedContent: some View {
        tabShell
            .onChange(of: store.activeServer?.id, initial: true) { _, serverID in
                router.adopt(serverID: serverID)
            }
            .task(id: visibleChatID) { await showVisibleChat(visibleChatID) }
            .onChange(of: store.iconBadgeCount, initial: true) { _, count in
                push.updateBadge(unreadChatCount: count)
            }
            .task { await push.attach(store) }
            .onAppear {
                push.taps.mount()
                Task { await routePendingPush() }
            }
            .onDisappear { push.taps.unmount() }
            .onChange(of: push.taps.pending) { Task { await routePendingPush() } }
            .alert("Notification unavailable", isPresented: pushNoticeBinding) {
                Button("OK") { push.taps.clearNotice() }
            } message: {
                Text(push.taps.notice ?? "")
            }
            .preferredColorScheme(preferredColorScheme)
            .seasonalIconOffer()
            .task {
                guard !openingEntranceFinished else { return }
                try? await Task.sleep(for: .seconds(1.2))
                openingEntranceFinished = true
            }
    }

    var appearanceBinding: Binding<AppearancePreference> {
        Binding(
            get: { AppearancePreference(rawValue: appearanceRawValue) ?? .system },
            set: { appearanceRawValue = $0.rawValue }
        )
    }

    private var preferredColorScheme: ColorScheme? {
        (AppearancePreference(rawValue: appearanceRawValue) ?? .system).colorScheme
    }

    private var pushNoticeBinding: Binding<Bool> {
        Binding(get: { push.taps.notice != nil }, set: { if !$0 { push.taps.clearNotice() } })
    }
}
