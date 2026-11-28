import SwiftUI

/// The floating header's single `…` menu: any place-specific actions first, then Call, Search,
/// and Details.
struct ChatHeaderMenu: View {
    let actions: [ChatHeaderMenuAction]
    let onCall: (() -> Void)?
    let onOpenSearch: () -> Void
    let onOpenChatDetails: () -> Void

    var body: some View {
        Menu {
            ChatHeaderMenuItems(
                actions: actions,
                onCall: onCall,
                onOpenSearch: onOpenSearch,
                onOpenChatDetails: onOpenChatDetails
            )
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

/// The Chat's actions as system toolbar items, for stock chrome: Files on a Project, Call on a
/// Captain chat, then More. The system draws them as one capsule, in the trailing rail wherever
/// bars are vertical.
struct ChatHeaderToolbar: ToolbarContent {
    let actions: [ChatHeaderMenuAction]
    let onOpenFiles: (() -> Void)?
    let onCall: (() -> Void)?
    let onOpenSearch: () -> Void
    let onOpenChatDetails: () -> Void

    var body: some ToolbarContent {
        ToolbarItemGroup(placement: .primaryAction) {
            if let onOpenFiles {
                Button("Files", systemImage: "folder", action: onOpenFiles)
            }
            if let onCall {
                Button("Call", systemImage: "phone", action: onCall)
            }
            Menu {
                ChatHeaderMenuItems(
                    actions: actions,
                    onCall: nil,
                    onOpenSearch: onOpenSearch,
                    onOpenChatDetails: onOpenChatDetails
                )
            } label: {
                Label("More", systemImage: "ellipsis")
            }
        }
    }
}

private struct ChatHeaderMenuItems: View {
    let actions: [ChatHeaderMenuAction]
    let onCall: (() -> Void)?
    let onOpenSearch: () -> Void
    let onOpenChatDetails: () -> Void

    var body: some View {
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
    }
}
