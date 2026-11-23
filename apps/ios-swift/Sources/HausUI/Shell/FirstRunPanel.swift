import SwiftUI

/// What a fresh Server still needs, and the next steps the viewer's role allows.
public struct FirstRunPresentation {
    public struct Step: Identifiable {
        public let title: String
        public let perform: () -> Void

        public var id: String { title }

        public init(title: String, perform: @escaping () -> Void) {
            self.title = title
            self.perform = perform
        }
    }

    public let title: String
    public let description: String
    public let steps: [Step]

    public init(title: String, description: String, steps: [Step]) {
        self.title = title
        self.description = description
        self.steps = steps
    }
}

/// The fresh-Server block: a title, why, and one button per next step, the
/// first prominent. Left-aligned at the list's margin, like the rows below it.
struct FirstRunPanel: View {
    let firstRun: FirstRunPresentation

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(firstRun.title)
                    .font(.body.weight(.medium))
                    .foregroundStyle(HausPlatformColor.ink)
                Text(firstRun.description)
                    .font(.subheadline)
                    .foregroundStyle(HausPlatformColor.mutedInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { steps }
                VStack(alignment: .leading, spacing: 8) { steps }
            }
            .controlSize(.large)
            .tint(HausPlatformColor.accent)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 20)
    }

    private var steps: some View {
        ForEach(Array(firstRun.steps.enumerated()), id: \.element.id) { index, step in
            if index == 0 {
                Button(step.title, action: step.perform)
                    .buttonStyle(.glassProminent)
            } else {
                Button(step.title, action: step.perform)
                    .buttonStyle(.glass)
            }
        }
    }
}
