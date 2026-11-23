import SwiftUI

extension View {
    /// A tab root or list screen's centered title at 17pt medium Inter, as Capy
    /// sets it. The navigation title stays the same string for Back and VoiceOver.
    func hausScreenTitle(_ title: String) -> some View {
        navigationTitle(title)
            .hausInlineNavigationTitle()
            #if os(iOS)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    HausScreenTitle(title: title)
                }
                .sharedBackgroundVisibility(.hidden)
            }
            #endif
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
