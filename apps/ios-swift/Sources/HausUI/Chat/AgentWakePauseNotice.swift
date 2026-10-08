import SwiftUI

/// A paused Agent's explanation on its profile: a warning glyph, the title,
/// and what happened and what to do, in one grouped row. The App's
/// `AgentWakePauseAlert` without Restart, which the phone does not offer.
struct AgentWakePauseNotice: View {
    let pause: AgentWakePausePresentation

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Image(systemName: "pause.circle.fill")
                .font(.body)
                .foregroundStyle(.orange)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(pause.title)
                    .font(.body.weight(.semibold))
                Text(pause.description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}

#Preview("Paused Agent") {
    List {
        AgentWakePauseNotice(
            pause: AgentWakePausePresentation(
                title: "Paused after repeated failures",
                description: "Cove failed 3 times in a row: the provider kept hitting its rate limit. "
                    + "Send a message to try again now. Haus will try once more automatically in 12 minutes."
            )
        )
    }
}
