import SwiftUI
import HausModels

/// The Cloud Agent jobs inside a Thread, below its preview. One job is just
/// its card. Two or more collapse like an iOS notification group: a header
/// with the count and how the jobs stand, the most urgent job's full card on
/// top, and up to two fixed-height edges peeking beneath it, so nothing moves
/// as time ticks. Show all fans every job out in the same order — working jobs
/// as compact cards, the rest as full ones — with Show less above and below.
struct ThreadCloudAgentStackView: View {
    let agents: [CloudAgentPresentation]
    @Binding var isExpanded: Bool
    let onOpen: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        // Ordering reads quiet time, which moves on its own; minutes are the
        // finest unit the ordering cares about.
        TimelineView(.periodic(from: .now, by: 30)) { context in
            content(ThreadCloudAgentStack(agents, at: context.date))
        }
    }

    @ViewBuilder
    private func content(_ stack: ThreadCloudAgentStack) -> some View {
        if stack.isSingle, let only = stack.top {
            CloudAgentCard(agent: only.agent)
                .threadStackElbow(fromBottom: ThreadCloudAgentStackMetrics.cardElbow)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                header(stack)
                ForEach(isExpanded ? stack.rows : Array(stack.rows.prefix(1))) { row in
                    if isExpanded {
                        card(row)
                            .transition(cardTransition)
                    } else {
                        CloudAgentCard(agent: row.agent)
                            .threadStackElbow(fromBottom: ThreadCloudAgentStackMetrics.cardElbow)
                            .padding(.bottom, ThreadCloudAgentStackMetrics.peekDepth(stack.peekCount))
                            .background(alignment: .bottom) { peeks(stack.peekCount) }
                    }
                }
                if isExpanded {
                    toggle(expanded: true, isFooter: true)
                        .frame(maxWidth: .infinity)
                        .threadStackElbow(fromBottom: ThreadCloudAgentStackMetrics.footerElbow)
                        .transition(.opacity)
                }
            }
        }
    }

    private func header(_ stack: ThreadCloudAgentStack) -> some View {
        HStack(alignment: .center, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(stack.title).font(.subheadline.weight(.semibold))
                // Every bucket is a fact to act on, so a long tally wraps
                // rather than dropping its tail; it changes only when a job does.
                counts(stack.counts).font(.footnote)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
            Spacer(minLength: 0)
            toggle(expanded: isExpanded, isFooter: false)
        }
    }

    private func counts(_ counts: [ThreadCloudAgentStack.Count]) -> Text {
        counts.enumerated().reduce(Text("")) { text, entry in
            let (index, count) = entry
            let separator = Text(index == 0 ? "" : " · ").foregroundColor(.secondary)
            let part: Text = switch count.tone {
            case .danger: Text(count.text).fontWeight(.semibold).foregroundColor(.red)
            case .warning: Text(count.text).fontWeight(.semibold).foregroundColor(CloudAgentTone.warning)
            case .standard: Text(count.text).foregroundColor(.secondary)
            }
            return text + separator + part
        }
    }

    private func toggle(expanded: Bool, isFooter: Bool) -> some View {
        Button {
            withAnimation(toggleAnimation) { isExpanded.toggle() }
        } label: {
            HStack(spacing: 5) {
                Text(expanded ? "Show less" : "Show all")
                if isFooter { Image(systemName: "chevron.up").font(.footnote.weight(.semibold)) }
            }
            .font(.subheadline.weight(.medium))
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.borderless)
        .accessibilityIdentifier(isFooter ? "cloud-agent-stack-show-less-footer" : "cloud-agent-stack-toggle")
    }

    /// Working jobs with nothing to act on read as their header; tapping one
    /// opens the Thread, like the preview above it.
    @ViewBuilder
    private func card(_ row: ThreadCloudAgentRow) -> some View {
        if row.usesCompactCard {
            Button(action: onOpen) {
                CloudAgentCard(agent: row.agent, isCompact: true)
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens the thread")
        } else {
            CloudAgentCard(agent: row.agent)
        }
    }

    /// The edges under the collapsed top card: each one step narrower and
    /// deeper than the last, at a fixed height.
    private func peeks(_ count: Int) -> some View {
        ZStack(alignment: .bottom) {
            ForEach((1...max(count, 1)).reversed(), id: \.self) { depth in
                if depth <= count {
                    Color.clear
                        .frame(height: ThreadCloudAgentStackMetrics.peekHeight)
                        .cloudAgentCardSurface(depth == 1 ? HausPlatformColor.recessedSurface
                                                          : HausPlatformColor.deepRecessedSurface)
                        .padding(.horizontal, ThreadCloudAgentStackMetrics.peekInset * CGFloat(depth))
                        .padding(.bottom, ThreadCloudAgentStackMetrics.peekDepth(count - depth))
                }
            }
        }
        .accessibilityHidden(true)
    }

    private var toggleAnimation: Animation {
        reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.42, dampingFraction: 0.86)
    }

    private var cardTransition: AnyTransition {
        reduceMotion ? .opacity : .offset(y: -24).combined(with: .opacity)
    }
}

enum ThreadCloudAgentStackMetrics {
    /// Each peeking edge shows this much below the card in front of it.
    static let peekStep: CGFloat = 8
    static let peekInset: CGFloat = 9
    static let peekHeight: CGFloat = 48
    /// Where the Thread connector turns in: level with a card's lower body, or
    /// the middle of the Show less row.
    static let cardElbow: CGFloat = 36
    static let footerElbow: CGFloat = 22

    static func peekDepth(_ count: Int) -> CGFloat { peekStep * CGFloat(count) }
}

extension View {
    /// Marks where the Thread connector's elbow meets the stack: a point on
    /// this view's leading edge, `fromBottom` above its bottom.
    func threadStackElbow(fromBottom offset: CGFloat) -> some View {
        overlay(alignment: .bottomLeading) {
            Color.clear
                .frame(width: 1, height: 1)
                // Anchor the 1pt marker itself; anchoring after the padding
                // would put the elbow at half the offset.
                .anchorPreference(key: ThreadIngressAnchor.self, value: .bounds) {
                    ThreadIngressAnchors(stackElbow: $0)
                }
                .padding(.bottom, offset)
        }
    }
}
