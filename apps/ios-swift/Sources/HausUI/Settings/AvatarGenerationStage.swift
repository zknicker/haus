import SwiftUI

/// The one thing the generator is about: the avatar, at the size and shape the
/// product actually draws it. Haus renders every avatar as a circle, so the
/// stage is a circle too — a rounded square would promise a crop the app never
/// shows. Every variant, the run being drawn, and a failed run are pages of the
/// same circle, swiped between in place, so nothing around it moves when a
/// drawing lands or a page changes.
struct AvatarGenerationStage: View {
    let agentName: String
    let currentAvatarURL: URL?
    let initials: String
    let session: AvatarGenerationSession

    static let diameter: CGFloat = 176

    var body: some View {
        VStack(spacing: 18) {
            ZStack {
                stage
                    .frame(width: Self.diameter, height: Self.diameter)
                    .clipShape(.circle)

                if session.shownPage == .latestRun, session.isGenerating {
                    AvatarGenerationRing()
                        .allowsHitTesting(false)
                }
            }
            .frame(width: Self.diameter, height: Self.diameter)
            .shadow(color: .black.opacity(session.shownVariant == nil ? 0 : 0.16), radius: 16, y: 8)
            .overlay(alignment: .bottom) {
                if let index = session.shownPageIndex, session.pages.count > 1 {
                    AvatarStageCounter(position: index + 1, count: session.pages.count)
                        .offset(y: 12)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(accessibilityLabel)
            .accessibilityValue(accessibilityValue)
            .accessibilityAdjustableAction { direction in
                switch direction {
                case .increment: session.page(by: 1)
                case .decrement: session.page(by: -1)
                @unknown default: break
                }
            }
            .accessibilityIdentifier(
                session.shownVariant == nil ? "avatar-preview-placeholder" : "generated-avatar-preview"
            )

            // The wait is the only prose the stage needs. Its line is always
            // laid out, so starting or finishing a run never moves the controls.
            Text("Drawing…")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .opacity(session.isGenerating ? 1 : 0)
                .accessibilityHidden(!session.isGenerating)
                .accessibilityIdentifier("avatar-generation-wait")
        }
        .animation(.snappy(duration: 0.25), value: session.isGenerating)
        .animation(.snappy(duration: 0.25), value: session.pages.count)
    }

    @ViewBuilder
    private var stage: some View {
        if session.pages.isEmpty {
            currentAvatar
        } else {
            TabView(selection: selection) {
                ForEach(session.pages, id: \.self) { page in
                    pageContent(page)
                        .frame(width: Self.diameter, height: Self.diameter)
                        .tag(page)
                }
            }
            #if os(iOS)
            .tabViewStyle(.page(indexDisplayMode: .never))
            #endif
        }
    }

    /// Before the first run the stage shows what the Agent wears today, dimmed,
    /// so the human sees what a new drawing would replace.
    private var currentAvatar: some View {
        AvatarView(name: agentName, url: currentAvatarURL, initials: initials, size: Self.diameter)
            .opacity(0.35)
            .overlay {
                Circle()
                    .strokeBorder(style: StrokeStyle(lineWidth: 1.5, dash: [6, 8]))
                    .foregroundStyle(.quaternary)
            }
    }

    @ViewBuilder
    private func pageContent(_ page: AvatarGenerationSession.Page) -> some View {
        switch page {
        case let .variant(id):
            if let variant = session.variants.first(where: { $0.id == id }) {
                AvatarGenerationVariantImage(payload: variant.payload)
            }
        case .latestRun:
            ZStack {
                Circle().fill(HausPlatformColor.groupedSurface)
                if case let .failed(_, message) = session.run {
                    VStack(spacing: 8) {
                        HausIcon(.alert, size: 22, weight: 1.9)
                            .foregroundStyle(.red)
                        Text(message)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .lineLimit(5)
                            .minimumScaleFactor(0.8)
                    }
                    .padding(26)
                    .accessibilityIdentifier("avatar-generation-error")
                } else {
                    HausIcon(.magic, size: 38, weight: 1.7)
                        .foregroundStyle(.tertiary)
                        .opacity(0.3)
                }
            }
        }
    }

    private var selection: Binding<AvatarGenerationSession.Page> {
        Binding(
            get: { session.shownPage ?? .latestRun },
            set: { session.select($0) }
        )
    }

    private var accessibilityLabel: String {
        switch session.shownPage {
        case nil:
            return "\(agentName)'s current avatar. No new avatar yet"
        case .variant:
            let count = session.pages.count
            let position = (session.shownPageIndex ?? 0) + 1
            return count > 1 ? "Variant \(position) of \(count)" : "\(agentName) generated avatar preview"
        case .latestRun:
            if case let .failed(_, message) = session.run {
                return message
            }
            return "Drawing an avatar for \(agentName)"
        }
    }

    private var accessibilityValue: String {
        guard session.shownPage == .latestRun, session.pages.count > 1,
              let index = session.shownPageIndex else { return "" }
        return "Page \(index + 1) of \(session.pages.count)"
    }
}

/// Generated avatars are 256px pixel art drawn well above that size here;
/// smoothing would blur the stepped edges the prompt asks the model for.
private struct AvatarGenerationVariantImage: View {
    let payload: AvatarImagePayload

    var body: some View {
        if let image {
            image
                .resizable()
                .interpolation(.none)
                .scaledToFill()
        }
    }

    private var image: Image? {
        #if os(iOS)
        return UIImage(data: payload.data).map(Image.init(uiImage:))
        #elseif os(macOS)
        return NSImage(data: payload.data).map(Image.init(nsImage:))
        #else
        return nil
        #endif
    }
}

/// One accent sweep around the rim. An avatar takes the image provider tens of
/// seconds, so the wait is marked on the thing being made. The rotation is
/// derived from the frame clock rather than a repeating animation, so it stops
/// the moment the ring leaves the hierarchy; Reduce Motion gets a still rim.
private struct AvatarGenerationRing: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static let period: TimeInterval = 1.15

    var body: some View {
        if reduceMotion {
            Circle()
                .strokeBorder(Color.accentColor.opacity(0.6), lineWidth: 4)
        } else {
            TimelineView(.animation) { context in
                let phase = context.date.timeIntervalSinceReferenceDate
                    .truncatingRemainder(dividingBy: Self.period) / Self.period
                Circle()
                    .strokeBorder(
                        AngularGradient(
                            colors: [.accentColor.opacity(0), .accentColor.opacity(0.2), .accentColor],
                            center: .center
                        ),
                        lineWidth: 4
                    )
                    .rotationEffect(.degrees(phase * 360))
            }
        }
    }
}

/// `2 / 3` over the stage's bottom edge, only when there is somewhere to swipe.
private struct AvatarStageCounter: View {
    let position: Int
    let count: Int

    var body: some View {
        Group {
            if #available(iOS 26, macOS 26, *) {
                label.glassEffect(.regular, in: .capsule)
            } else {
                label.background(.thinMaterial, in: .capsule)
            }
        }
        .accessibilityHidden(true)
        .accessibilityIdentifier("avatar-stage-counter")
    }

    private var label: some View {
        Text("\(position) / \(count)")
            .font(.footnote.weight(.semibold).monospacedDigit())
            .foregroundStyle(.primary)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
    }
}
