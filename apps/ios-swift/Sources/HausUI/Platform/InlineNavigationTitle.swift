import SwiftUI

extension View {
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
