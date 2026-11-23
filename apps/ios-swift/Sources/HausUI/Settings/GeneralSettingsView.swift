import SwiftUI

/// How chat reads on this device. Each switch carries its explanation as the
/// section footer.
struct GeneralSettingsView: View {
    @AppStorage(ScrollNewMessagesToTop.storageKey)
    private var scrollsNewMessagesToTop = ScrollNewMessagesToTop.defaultValue

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                SettingsSection("Chat", footer: Self.scrollFooter) {
                    SettingsListGroup {
                        SettingsToggleRow(
                            ScrollNewMessagesToTop.title,
                            icon: .send,
                            isOn: $scrollsNewMessagesToTop,
                            showsDivider: false
                        )
                    }
                }
                SettingsSection(nil, footer: ShowClaimsInChat.footer) {
                    SettingsListGroup {
                        ShowClaimsInChatRow()
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .background(HausPlatformColor.canvas)
        .navigationTitle("General")
        .hausInlineNavigationTitle()
    }

    nonisolated static let scrollFooter = "When you send, your message moves to the top of the chat with room below for the reply."
}

/// This device's push switch, on a screen of its own.
struct NotificationsSettingsView: View {
    let setting: PushNotificationsSetting

    var body: some View {
        ScrollView {
            PushNotificationsSection(setting: setting)
                .padding(.horizontal, 16)
                .padding(.top, 10)
                .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .background(HausPlatformColor.canvas)
        .navigationTitle("Notifications")
        .hausInlineNavigationTitle()
    }
}

#Preview("General") {
    NavigationStack { GeneralSettingsView() }
}

#Preview("General, accessibility size") {
    NavigationStack { GeneralSettingsView() }
        .dynamicTypeSize(.accessibility3)
}
