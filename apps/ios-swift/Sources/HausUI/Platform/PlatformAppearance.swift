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

    /// One step deeper than `inputSurface`: a surface sitting behind another.
    static var recessedSurface: Color {
        #if canImport(UIKit)
        Color(uiColor: .secondarySystemFill)
        #else
        Color(nsColor: .controlBackgroundColor)
        #endif
    }

    /// Two steps deeper than `inputSurface`: the furthest surface in a stack.
    static var deepRecessedSurface: Color {
        #if canImport(UIKit)
        Color(uiColor: .systemFill)
        #else
        Color(nsColor: .controlBackgroundColor)
        #endif
    }

    /// The row a split's content pane shows, in every list beside it.
    static var selectedRow: Color {
        deepRecessedSurface
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
    func hausHiddenNavigationBar(_ isHidden: Bool = true) -> some View {
        #if os(iOS)
        toolbarVisibility(isHidden ? .hidden : .automatic, for: .navigationBar)
        #else
        self
        #endif
    }
}
