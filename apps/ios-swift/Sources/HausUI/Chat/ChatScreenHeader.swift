import HausModels
import SwiftUI

/// One extra action in the Chat header's `…` menu, such as Stop on a Captain DM. It shows above
/// the menu's own actions.
public struct ChatHeaderMenuAction: Identifiable, Sendable {
    public let id: String
    public let title: String
    /// A second line under the title, such as the model a Captain runs on.
    public let subtitle: String?
    public let systemImage: String
    public let isDestructive: Bool
    /// A disabled action still shows, to state where something stands.
    public let isEnabled: Bool
    public let perform: @MainActor @Sendable () -> Void

    public init(
        id: String,
        title: String,
        subtitle: String? = nil,
        systemImage: String,
        isDestructive: Bool = false,
        isEnabled: Bool = true,
        perform: @escaping @MainActor @Sendable () -> Void
    ) {
        self.id = id
        self.title = title
        self.subtitle = subtitle
        self.systemImage = systemImage
        self.isDestructive = isDestructive
        self.isEnabled = isEnabled
        self.perform = perform
    }

    /// Stop on a Captain DM, in the phase the Server's answers put it.
    static func captainStop(_ phase: CaptainStopPhase, confirm: @escaping @MainActor @Sendable () -> Void) -> Self {
        ChatHeaderMenuAction(
            id: "captain-stop",
            title: CaptainStopCopy.title(phase),
            systemImage: CaptainStopCopy.systemImage(phase),
            isDestructive: CaptainStopCopy.isActionable(phase),
            isEnabled: CaptainStopCopy.isActionable(phase),
            perform: confirm
        )
    }
}

/// The Chat canvas's floating header: a glass back circle, the centered identity (a Captain's
/// mark, a Project's bare glyph, or a person's avatar, then the name), and one `…` menu. Live work
/// hangs centered under the identity. While Server is unreachable the title reads "Connecting…"
/// (`ConnectionOutage`).
struct ChatScreenHeader: View {
    static let identitySide: CGFloat = 28
    /// A Project's glyph sits in the title's line at the title's size, with no box around it.
    static let channelGlyphSide: CGFloat = 17

    let chat: ChatDestination
    let isConnected: Bool
    let onBack: () -> Void
    let onOpenChatDetails: () -> Void
    let onOpenSearch: () -> Void
    let onCall: (() -> Void)?
    let menuActions: [ChatHeaderMenuAction]
    @Binding var turnDetails: TurnDetailsFocus?

    @State private var showsOutage = false
    @Environment(\.chatHeaderShowsBack) private var showsBack
    @State private var stopTarget: CaptainStopTarget?
    @Environment(\.captainStop) private var captainStop

    var body: some View {
        ChromeHeader(inset: 20) {
            if showsBack {
                GlassChromeButton(.system("chevron.left"), label: "Back", action: onBack)
            }
        } center: {
            Button(action: onOpenChatDetails) {
                HStack(spacing: chat.kind.isChannel ? 5 : 8) {
                    identity
                    title
                }
            }
            .buttonStyle(.plain)
            .accessibilityHint("Shows details")
            // The header caps its text size like a navigation bar does, so a reader at an
            // accessibility size gets the system's enlarged preview on a long press instead.
            .accessibilityShowsLargeContentViewer {
                Text(chat.title)
            }
        } trailing: {
            ChatHeaderMenu(
                actions: placeActions,
                onCall: onCall,
                onOpenSearch: onOpenSearch,
                onOpenChatDetails: onOpenChatDetails
            )
        }
        .overlay(alignment: .top) { engagement }
        .connectionOutage(isConnected: isConnected, showsOutage: $showsOutage)
        .captainStopConfirmation($stopTarget)
    }

    /// The caller's actions, with Stop first on a Captain DM.
    private var placeActions: [ChatHeaderMenuAction] {
        guard case .agentDirectMessage(let agent) = chat.kind,
              let phase = captainStop?.phase(agent.id)
        else { return menuActions }
        let target = CaptainStopTarget(id: agent.id, name: agent.name)
        return [.captainStop(phase) { stopTarget = target }] + menuActions
    }

    private var title: some View {
        Text(showsOutage ? ConnectionOutage.title : chat.title)
            .font(.system(size: 17, weight: .medium))
            .foregroundStyle(showsOutage ? HausPlatformColor.mutedInk : HausPlatformColor.ink)
            .lineLimit(1)
            .contentTransition(.opacity)
            .animation(.easeOut(duration: 0.2), value: showsOutage)
            .accessibilityLabel(showsOutage ? "\(chat.title), connecting" : chat.title)
    }

    /// Live work: an overlay under the identity, so it never moves the transcript.
    @ViewBuilder
    private var engagement: some View {
        if let chatID = chat.durableChat?.id {
            HeaderEngagement(chatID: chatID, style: chat.kind.engagementStyle, turnDetails: $turnDetails)
                .fixedSize(horizontal: false, vertical: true)
                .offset(y: HausChrome.headerHeight - 4)
        }
    }

    @ViewBuilder
    private var identity: some View {
        switch chat.kind {
        case .channel:
            ChannelGlyph(appearance: chat.appearance, size: Self.channelGlyphSide)
        case .agentDirectMessage(let agent):
            CaptainAvatarMark(name: agent.name, url: agent.avatarURL, side: Self.identitySide)
        case .humanDirectMessage(let human):
            AvatarView(name: human.name, url: human.avatarURL, size: Self.identitySide)
        }
    }
}

/// The header's single `…` menu: any place-specific actions first, then Call, Search, and Details.
private struct ChatHeaderMenu: View {
    let actions: [ChatHeaderMenuAction]
    let onCall: (() -> Void)?
    let onOpenSearch: () -> Void
    let onOpenChatDetails: () -> Void

    var body: some View {
        Menu {
            if !actions.isEmpty {
                Section {
                    ForEach(actions) { action in
                        Button(role: action.isDestructive ? .destructive : nil, action: action.perform) {
                            Label(action.title, systemImage: action.systemImage)
                            if let subtitle = action.subtitle { Text(subtitle) }
                        }
                        .disabled(!action.isEnabled)
                    }
                }
            }
            Section {
                if let onCall {
                    Button(action: onCall) { Label("Call", systemImage: "phone") }
                }
                Button(action: onOpenSearch) { Label("Search in Chat", systemImage: "magnifyingglass") }
                Button(action: onOpenChatDetails) { Label("Details", systemImage: "info.circle") }
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: GlassChromeButton.iconGlyphSize - 3, weight: .semibold))
                .frame(width: GlassChromeButton.diameter - 14, height: GlassChromeButton.diameter - 14)
        }
        .buttonStyle(.glass)
        .buttonBorderShape(.circle)
        .foregroundStyle(HausPlatformColor.label)
        .fixedSize()
        .accessibilityLabel("More")
    }
}

extension EnvironmentValues {
    /// False where the Chat is the root of its pane, such as the content pane
    /// of a split tab: there is nothing behind it to go back to.
    @Entry public var chatHeaderShowsBack = true
}
