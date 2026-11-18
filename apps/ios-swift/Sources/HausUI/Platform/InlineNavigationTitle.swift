import SwiftUI

extension View {
    @ViewBuilder
    func inlineNavigationTitle(_ title: String, subtitle: String?) -> some View {
        #if os(iOS)
        if #available(iOS 26, *), let subtitle {
            navigationTitle(title)
                .navigationSubtitle(subtitle)
                .navigationBarTitleDisplayMode(.inline)
        } else {
            navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    if let subtitle {
                        ToolbarItem(placement: .principal) {
                            VStack(spacing: 0) {
                                Text(title).font(.headline)
                                Text(subtitle)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .lineLimit(1)
                            .accessibilityElement(children: .combine)
                        }
                    }
                }
        }
        #else
        navigationTitle(title)
        #endif
    }
}
