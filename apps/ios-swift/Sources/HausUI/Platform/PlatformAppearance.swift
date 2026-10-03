import SwiftUI

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

enum HausPlatformColor {
    static var label: Color {
        #if canImport(UIKit)
        Color(uiColor: .label)
        #else
        Color(nsColor: .labelColor)
        #endif
    }

    static var secondaryLabel: Color {
        #if canImport(UIKit)
        Color(uiColor: .secondaryLabel)
        #else
        Color(nsColor: .secondaryLabelColor)
        #endif
    }

    static var background: Color {
        #if canImport(UIKit)
        Color(uiColor: .systemBackground)
        #else
        Color(nsColor: .windowBackgroundColor)
        #endif
    }

    static var groupedBackground: Color {
        #if canImport(UIKit)
        Color(uiColor: .systemGroupedBackground)
        #else
        Color(nsColor: .windowBackgroundColor)
        #endif
    }

    static var groupedSurface: Color {
        #if canImport(UIKit)
        Color(uiColor: .secondarySystemGroupedBackground)
        #else
        Color(nsColor: .controlBackgroundColor)
        #endif
    }

    static var inputSurface: Color {
        #if canImport(UIKit)
        Color(uiColor: .tertiarySystemFill)
        #else
        Color(nsColor: .controlBackgroundColor)
        #endif
    }

    static var separator: Color {
        #if canImport(UIKit)
        Color(uiColor: .separator)
        #else
        Color(nsColor: .separatorColor)
        #endif
    }

    /// Opaque grey for a disabled round control, so glass vibrancy cannot dissolve it.
    static var disabledControlFill: Color {
        #if canImport(UIKit)
        Color(uiColor: .systemGray3)
        #else
        Color(nsColor: .disabledControlTextColor)
        #endif
    }
}

extension View {
    @ViewBuilder
    func hausInlineNavigationTitle() -> some View {
        #if os(iOS)
        navigationBarTitleDisplayMode(.inline)
        #else
        self
        #endif
    }

    /// Sets the gap between list sections for a Linear-like rhythm.
    ///
    /// The Tasks list rules its section boundaries, so this only has to keep the
    /// last row of a group off that rule; Linear's groups sit close to the line.
    @ViewBuilder
    func hausCompactListSections() -> some View {
        #if os(iOS)
        listSectionSpacing(10)
        #else
        self
        #endif
    }

    @ViewBuilder
    func hausWordsAutocapitalization() -> some View {
        #if os(iOS)
        textInputAutocapitalization(.words)
        #else
        self
        #endif
    }

    @ViewBuilder
    func hausHandleInput() -> some View {
        #if os(iOS)
        textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        #else
        self
        #endif
    }
}

public extension View {
    /// Hides the system navigation bar on a screen that supplies its own ``ChromeHeader``.
    @ViewBuilder
    func hausHiddenNavigationBar() -> some View {
        #if os(iOS)
        toolbar(.hidden, for: .navigationBar)
        #else
        self
        #endif
    }
}

/// What is closing the sidebar drawer, which decides whether its veil is still
/// painted while the canvas slides back.
///
/// The veil covers one Chat. An interactive close returns that same Chat, so the
/// veil lifting off it is part of the close. A Chat selection replaces the screen
/// under the veil in the frame the close begins, and a veil left to lift would
/// dissolve over a Chat that was never behind it — read as a fade over the new
/// Chat rather than as the canvas sliding back.
enum HausDrawerClose {
    /// A drag, a tap on the veil, or the header button: the Chat stays.
    case interactive
    /// A Chat selection: a different screen mounts as the close begins.
    case chatSelection
}

/// The veil painted over the Chat canvas while the sidebar drawer is open.
///
/// Light mode fades the canvas toward the background and reads its edge from the
/// canvas shadow. Dark mode cannot: a darker veil would erase the edge between a
/// black canvas and a black sidebar, so the canvas lifts to an elevated surface
/// instead.
enum HausDrawerVeil {
    static func color(for scheme: ColorScheme) -> Color {
        scheme == .dark ? .white : HausPlatformColor.background
    }

    static func opacity(for scheme: ColorScheme, progress: CGFloat) -> Double {
        Double(progress) * (scheme == .dark ? 0.11 : 0.55)
    }

    /// Whether the veil is drawn at all.
    ///
    /// Progress is a discrete state value that jumps to its target the moment the
    /// drawer is told to close, so this answer flips at the head of the close, not
    /// at its end. That is what makes it the switch between the two closes: inside
    /// the closing spring it takes the veil out with the animated removal that
    /// reads as the canvas lifting; outside any animation — where a Chat selection
    /// commits — the same removal is a hard cut in the frame the new screen mounts.
    static func isPainted(progress: CGFloat, close: HausDrawerClose) -> Bool {
        progress > 0 && close == .interactive
    }
}
