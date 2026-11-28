import SwiftUI

extension View {
    /// A tab root or list screen's centered title at 17pt medium Inter, as Capy
    /// sets it. In a split tab's list column under stock bars it is the
    /// system's large title, leading the column. The navigation title stays the
    /// same string for Back and VoiceOver.
    func hausScreenTitle(_ title: String) -> some View {
        modifier(ScreenTitle(title: title))
    }

    @ViewBuilder
    func inlineNavigationTitle(_ title: String, subtitle: String?) -> some View {
        #if os(iOS)
        if let subtitle {
            navigationTitle(title)
                .navigationSubtitle(subtitle)
                .navigationBarTitleDisplayMode(.inline)
        } else {
            navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
        }
        #else
        navigationTitle(title)
        #endif
    }
}

private struct ScreenTitle: ViewModifier {
    let title: String

    @Environment(\.isListColumn) private var isListColumn
    @Environment(\.shellChrome) private var shellChrome

    func body(content: Content) -> some View {
        #if os(iOS)
        if isListColumn, shellChrome == .stock {
            content
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.large)
        } else {
            content
                .navigationTitle(title)
                .hausInlineNavigationTitle()
                .toolbar {
                    ToolbarItem(placement: .principal) {
                        HausScreenTitle(title: title)
                    }
                    .sharedBackgroundVisibility(.hidden)
                }
        }
        #else
        content.navigationTitle(title)
        #endif
    }
}

private struct HausScreenTitle: View {
    let title: String

    var body: some View {
        Text(title)
            .hausFont(.screenTitle)
            .foregroundStyle(HausPlatformColor.label)
            .lineLimit(1)
            .accessibilityAddTraits(.isHeader)
    }
}
