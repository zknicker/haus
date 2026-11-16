import SwiftUI

/// The claim work-surface metadata that follows its anchor message.
///
/// The anchor remains the canonical claim title and the navigation bar names
/// the claim by number, so this view renders only the Server-owned claim fields.
/// A Thread opened for a reply's claim titles itself "Thread", so the card
/// names its own number and is never read as the claim the reader opened.
struct ThreadClaimMetadataView: View {
    let claim: ClaimPresentation
    var namesClaim = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if namesClaim {
                LabeledContent("Claim") {
                    Text("#\(claim.number)").font(.subheadline.weight(.semibold))
                }
            }

            LabeledContent("Status") {
                ClaimStatusLabel(status: claim.status)
            }

            LabeledContent("Assignee") {
                ClaimActorLabel(actor: claim.assignee, emptyLabel: "Unassigned")
            }

            LabeledContent("Created by") {
                ClaimActorLabel(actor: claim.creator, emptyLabel: "Unknown")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(HausPlatformColor.inputSurface, in: .haus(HausRadius.large))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Claim #\(claim.number) details")
    }
}

private struct ClaimStatusLabel: View {
    let status: ClaimStatusPresentation

    var body: some View {
        HStack(spacing: 7) {
            TaskStatusDisc(
                status: TaskStatusShape(status),
                surface: HausPlatformColor.background
            )
            Text(status.rawValue)
        }
        .font(.subheadline.weight(.semibold))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(status.rawValue)
    }
}

private struct ClaimActorLabel: View {
    let actor: MessageAuthorPresentation?
    let emptyLabel: String

    var body: some View {
        if let actor {
            HStack(spacing: 7) {
                AvatarView(
                    name: actor.name,
                    url: actor.avatarURL,
                    presence: actor.presence,
                    size: 22
                )
                Text(actor.name)
                    .font(.subheadline)
                    .lineLimit(1)
            }
            .accessibilityElement(children: .combine)
        } else {
            Text(emptyLabel)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }
}
