import SwiftUI

/// Transient connection chrome shared by messaging surfaces.
struct ConnectionStatusBanner: View {
    var body: some View {
        Group {
            if #available(iOS 26, macOS 26, *) {
                content
                    .glassEffect(.regular, in: .haus(HausRadius.large))
            } else {
                content
                    .background(.thinMaterial, in: .haus(HausRadius.large))
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Reconnecting to Haus. Messages will send when you're back online.")
    }

    private var content: some View {
        HStack(spacing: 10) {
            ProgressView()
                .controlSize(.small)

            Text("Reconnecting… messages will send when you're back online.")
                .font(.callout.weight(.medium))
                .multilineTextAlignment(.leading)

            Spacer(minLength: 0)
        }
        .foregroundStyle(.secondary)
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, minHeight: 42, alignment: .leading)
    }
}
