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

/// The Chat canvas's header. With custom chrome it floats: a glass back circle, the centered
/// identity (a Captain's mark, a Project's bare glyph, or a person's avatar, then the name), and
/// one `…` menu, with live work centered under the identity. With stock chrome the identity and
/// live work lead the column, and the system draws Back and the actions (`ChatHeaderToolbar`).
/// While Server is unreachable the title reads "Connecting…" (`ConnectionOutage`).
struct ChatScreenHeader: View {
    static let identitySide: CGFloat = 28
    /// A Project's glyph sits in the title's line at the title's size, with no box around it.
    static let channelGlyphSide: CGFloat = 17

    let chat: ChatDestination
    let isConnected: Bool
    let onBack: () -> Void
    let onOpenChatDetails: () -> Void
    let onOpenSearch: () -> Void
    let onOpenFiles: (() -> Void)?
    let onCall: (() -> Void)?
    let menuActions: [ChatHeaderMenuAction]
    @Binding var turnDetails: TurnDetailsFocus?

    @State private var showsOutage = false
    @Environment(\.chatHeaderShowsBack) private var showsBack
    @Environment(\.chatHeaderYieldsToolbar) private var yieldsToolbar
    @Environment(\.shellChrome) private var shellChrome
    @State private var stopTarget: CaptainStopTarget?
    @Environment(\.captainStop) private var captainStop

    var body: some View {
        Group {
            switch shellChrome {
            case .custom: floatingRow
            case .stock: leadingRow
            }
        }
        .overlay(alignment: shellChrome == .stock ? .topLeading : .top) { engagement }
        .connectionOutage(isConnected: isConnected, showsOutage: $showsOutage)
        .captainStopConfirmation($stopTarget)
    }

    private var floatingRow: some View {
        ChromeHeader(inset: 20) {
            if showsBack {
                GlassChromeButton(.system("chevron.left"), label: "Back", action: onBack)
            }
        } center: {
            identityButton
        } trailing: {
            ChatHeaderMenu(
                actions: placeActions,
                onCall: onCall,
                onOpenSearch: onOpenSearch,
                onOpenChatDetails: onOpenChatDetails
            )
        }
    }

    private var leadingRow: some View {
        ChromeHeader(inset: 20) {
            identityButton
        } center: {
            EmptyView()
        } trailing: {
            EmptyView()
        }
        .toolbar {
            if !yieldsToolbar {
                ChatHeaderToolbar(
                    actions: placeActions,
                    onOpenFiles: onOpenFiles,
                    onCall: onCall,
                    onOpenSearch: onOpenSearch,
                    onOpenChatDetails: onOpenChatDetails
                )
            }
        }
    }

    private var identityButton: some View {
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
    }

    /// The caller's actions, with Stop first on a Captain DM.
    private var placeActions: [ChatHeaderMenuAction] {
        guard case .captainChat(let agent) = chat.kind,
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
                .padding(.leading, shellChrome == .stock ? 20 : 0)
                .offset(y: HausChrome.headerHeight - 4)
        }
    }

    @ViewBuilder
    private var identity: some View {
        switch chat.kind {
        case .channel:
            ChannelGlyph(appearance: chat.appearance, size: Self.channelGlyphSide)
        case .captainChat(let agent):
            CaptainAvatarMark(name: agent.name, url: agent.avatarURL, side: Self.identitySide)
        case .humanDirectMessage(let human):
            AvatarView(name: human.name, url: human.avatarURL, size: Self.identitySide)
        }
    }
}

extension EnvironmentValues {
    /// False where the Chat is the root of its pane, such as the content pane
    /// of a split tab: there is nothing behind it to go back to.
    @Entry public var chatHeaderShowsBack = true
}
