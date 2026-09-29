import Observation
import SwiftUI

/// Whether iOS lets Haus show notifications, as far as the Settings row needs
/// to know.
public enum NotificationPermission: Sendable, Equatable {
    case undetermined
    case granted
    case denied
}

/// The per-device switch for Needs you pushes, mirroring the App's
/// `haus.notifications.needsYou` preference: it reads on only when the reader
/// turned it on here and iOS granted permission. Permission is requested from
/// this switch alone, never at launch.
///
/// The App owns the permission request and device registration; this model is
/// only what the row shows and the two things it can ask for.
@MainActor
@Observable
public final class NeedsYouNotificationsSetting {
    public static let storageKey = "haus.notifications.needsYou"

    public var permission: NotificationPermission
    public var isPreferred: Bool
    public var isRequesting = false
    @ObservationIgnored public var onChange: @MainActor (Bool) -> Void
    @ObservationIgnored public var onOpenSystemSettings: @MainActor () -> Void

    public init(
        permission: NotificationPermission = .undetermined,
        isPreferred: Bool = false,
        onChange: @escaping @MainActor (Bool) -> Void = { _ in },
        onOpenSystemSettings: @escaping @MainActor () -> Void = {}
    ) {
        self.permission = permission
        self.isPreferred = isPreferred
        self.onChange = onChange
        self.onOpenSystemSettings = onOpenSystemSettings
    }

    public var isOn: Bool { isPreferred && permission == .granted }
}

/// The Needs you notifications section. Row titles stay short and the
/// explanation lives in the footer, where it wraps at any text size. Denied
/// permission cannot be re-asked from inside the app, so that state adds the
/// way to the Settings app beside the switch.
public struct NeedsYouNotificationsSection: View {
    let setting: NeedsYouNotificationsSetting

    public init(setting: NeedsYouNotificationsSetting) {
        self.setting = setting
    }

    public var body: some View {
        SettingsSection("Needs you", footer: footer) {
            SettingsListGroup {
                SettingsToggleRow(
                    "Notifications",
                    icon: .notification,
                    isOn: Binding(
                        get: { setting.isOn },
                        set: { setting.onChange($0) }
                    ),
                    showsDivider: isDenied
                )
                .disabled(setting.isRequesting || isDenied)

                if isDenied {
                    DisclosureRow(
                        "Open Settings",
                        icon: .settings,
                        showsDivider: false,
                        action: setting.onOpenSystemSettings
                    )
                }
            }
        }
    }

    private var isDenied: Bool { setting.permission == .denied }

    private var footer: String {
        isDenied
            ? "Notifications are off for Haus. Allow them in Settings to hear about DMs, @mentions, and replies."
            : "Get notified when someone DMs you, @mentions you, or replies to your message while Haus is in the background."
    }
}
