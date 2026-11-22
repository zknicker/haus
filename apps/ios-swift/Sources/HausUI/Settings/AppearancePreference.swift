import SwiftUI

public enum AppearancePreference: String, CaseIterable, Hashable, Sendable {
    case system
    case light
    case dark

    public var title: String {
        switch self {
        case .system: "System"
        case .light: "Light"
        case .dark: "Dark"
        }
    }

    /// The scheme to force, or `nil` to follow the system.
    public var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}
