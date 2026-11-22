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
/// first prominent.
struct FirstRunPanel: View {
    let firstRun: FirstRunPresentation

    var body: some View {
        VStack(spacing: 14) {
            VStack(spacing: 6) {
                Text(firstRun.title)
                    .font(.title3.weight(.semibold))
                Text(firstRun.description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .multilineTextAlignment(.center)
            VStack(spacing: 8) {
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
            .controlSize(.large)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .padding(.horizontal, 20)
    }
}
