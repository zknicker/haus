import OSLog
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// The Home Screen icon this device shows.
///
/// Per device and outside the Server, like appearance. The system owns the
/// answer: `UIApplication.alternateIconName` is read back every time rather
/// than mirrored into `@AppStorage`, so the row can never claim an icon the
/// Home Screen is not showing. Each alternate's name is its Icon Composer
/// bundle (`assets/<name>.icon`) and its `CFBundleAlternateIcons` key.
public enum AppIconChoice: String, CaseIterable, Sendable {
    case ghost
    case pumpkin

    /// `nil` selects the primary icon, the ghost.
    public var alternateIconName: String? {
        switch self {
        case .ghost: nil
        case .pumpkin: "halloween-icon"
        }
    }

    public var title: String {
        switch self {
        case .ghost: "Ghost"
        case .pumpkin: "Pumpkin"
        }
    }

    /// An unknown alternate name falls back to the ghost, the icon iOS shows
    /// when a bundle no longer carries the alternate it was set to.
    public init(alternateIconName: String?) {
        self = Self.allCases.first { $0.alternateIconName == alternateIconName } ?? .ghost
    }
}

/// The Preferences row that switches the Home Screen icon. iOS confirms the
/// change with its own alert; that is the platform's, not ours.
public struct AppIconRow: View {
    @State private var choice = AppIconChoice.ghost

    public init() {}

    public var body: some View {
        PickerRow(
            "App icon",
            value: choice,
            icon: .appIcon,
            options: AppIconChoice.allCases.map { ($0, $0.title) },
            onChange: select
        )
        .task { choice = AppIconSwitcher.current }
    }

    private func select(_ next: AppIconChoice) {
        guard next != choice else { return }
        // A choice made here is the user's own; no seasonal offer nags it back.
        SeasonalIconOfferStore.forgetOfferSwitch()
        Task {
            choice = await AppIconSwitcher.set(next)
        }
    }
}

@MainActor
enum AppIconSwitcher {
    private static let logger = Logger(subsystem: "chat.haus.ios", category: "app-icon")

    static var current: AppIconChoice {
        #if canImport(UIKit)
        AppIconChoice(alternateIconName: UIApplication.shared.alternateIconName)
        #else
        .ghost
        #endif
    }

    /// Returns the icon the system shows afterwards, which is the previous
    /// one when the switch fails.
    static func set(_ choice: AppIconChoice) async -> AppIconChoice {
        #if canImport(UIKit)
        guard UIApplication.shared.supportsAlternateIcons else {
            logger.error("Alternate app icons are unsupported on this device")
            return current
        }
        do {
            try await UIApplication.shared.setAlternateIconName(choice.alternateIconName)
        } catch {
            logger.error(
                "Switching the app icon to \(choice.rawValue, privacy: .public) failed: \(error.localizedDescription, privacy: .public)"
            )
        }
        #endif
        return current
    }
}
