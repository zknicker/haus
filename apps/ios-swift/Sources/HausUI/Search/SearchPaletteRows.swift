import SwiftUI

/// A one-line palette row: a 28pt lead column, then the title.
struct SearchPaletteLine<Lead: View>: View {
    let title: String
    var detail: String?
    @ViewBuilder let lead: () -> Lead

    @ScaledMetric(relativeTo: .body) private var minHeight: CGFloat = 44

    var body: some View {
        HStack(spacing: 0) {
            lead()
                .frame(width: 28, alignment: .leading)
            Text(title)
                .hausFont(.workRowTitle)
                .foregroundStyle(HausPlatformColor.ink)
                .lineLimit(1)
            if let detail {
                Text(detail)
                    .hausFont(.workRowMeta)
                    .foregroundStyle(HausPlatformColor.mutedInk)
                    .lineLimit(1)
                    .padding(.leading, 8)
            }
            Spacer(minLength: 0)
        }
        .frame(minHeight: minHeight)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }
}

struct SearchCaptainRow: View {
    let captain: SearchCaptain

    var body: some View {
        SearchPaletteLine(title: captain.name) {
            SearchCaptainMark(captain: captain, side: 20)
        }
    }
}

struct SearchCaptainMark: View {
    let captain: SearchCaptain
    let side: CGFloat

    var body: some View {
        CaptainFaceMark(
            captain: CaptainIdentity(id: captain.id, name: captain.name, avatarURL: captain.avatarURL),
            side: side,
            isWorking: captain.isWorking
        )
    }
}

struct SearchProjectRow: View {
    let project: ChatPresentation

    var body: some View {
        SearchPaletteLine(title: project.title) {
            ChannelGlyph(appearance: project.appearance, size: ListLead.glyphSize)
        }
        .accessibilityValue(project.unreadCount > 0 ? "Unread" : "")
    }
}

struct SearchPersonRow: View {
    let person: SearchPerson

    var body: some View {
        SearchPaletteLine(title: person.name, detail: person.handle.map { "@\($0)" }) {
            AvatarView(name: person.name, url: person.avatarURL, size: 20)
        }
    }
}

struct SearchActionRow: View {
    let action: SearchPaletteAction

    var body: some View {
        SearchPaletteLine(title: action.title) {
            Image(systemName: action.systemImage)
                .resizable()
                .scaledToFit()
                .fontWeight(.regular)
                .frame(width: 17, height: 17)
                .foregroundStyle(HausPlatformColor.mutedInk)
                .accessibilityHidden(true)
        }
    }
}

/// A Task as Recent lists it: the state disc, the title, then the Captain's
/// mark with `HAUS-41 · now`.
struct SearchTaskRow: View {
    let task: SearchTask
    let now: Date

    var body: some View {
        WorkListRow(title: task.title) {
            TaskStateDisc(state: task.state, size: 16, surface: HausPlatformColor.canvas)
        } meta: {
            if let captain = task.captain {
                SearchCaptainMark(captain: captain, side: 16)
            } else if let person = task.person {
                AvatarView(name: person.name, url: person.avatarURL, size: 16)
            }
            WorkMetaLine(pieces: [task.key, HausCompactRelativeTime.label(for: task.updatedAt, now: now)])
        }
        .accessibilityValue(TaskStateLabel.text(task.state))
    }
}

/// The palette's glass field and the close circle beside it.
struct SearchPaletteField: View {
    @Binding var query: String
    var isFocused: FocusState<Bool>.Binding
    let onClose: () -> Void

    @ScaledMetric(relativeTo: .body) private var height: CGFloat = 44

    var body: some View {
        HStack(spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(HausPlatformColor.mutedInk)
                    .accessibilityHidden(true)
                TextField("Search Haus", text: $query)
                    .hausFont(.workRowTitle)
                    .focused(isFocused)
                    .submitLabel(.search)
#if os(iOS)
                    .textInputAutocapitalization(.never)
#endif
                    .autocorrectionDisabled()
            }
            .padding(.horizontal, 16)
            .frame(height: height)
            .glassEffect(.regular.interactive(), in: .capsule)
            if showsClose {
                GlassChromeButton(.icon(.close), label: "Close", action: onClose)
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .padding(.horizontal, 20)
        .animation(.snappy, value: showsClose)
    }

    /// The close circle shows only while the field is in use; at rest the
    /// field runs to the margin.
    private var showsClose: Bool {
        isFocused.wrappedValue || !query.isEmpty
    }
}
