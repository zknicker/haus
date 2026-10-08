import SwiftUI

/// The entry point on an Agent's profile, directly under its avatar so the
/// action sits on the thing it changes. Only an ordinary Agent shows it: the
/// Server keeps Haus's own factory Agents on their product-owned artwork.
struct AgentAvatarGeneratorEntry: View {
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 7) {
                HausIcon(.magic, size: 17, weight: 1.9)
                Text("Generate avatar")
                    .font(.subheadline.weight(.medium))
            }
            .foregroundStyle(.tint)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(HausPlatformColor.groupedSurface, in: .capsule)
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
        .accessibilityIdentifier("generate-agent-avatar")
    }
}

/// Concept in, variants out, saved only on purpose.
///
/// The stage leads and the controls follow it: the avatar is the subject of
/// the screen, and the primary action lives at the thumb rather than in the
/// navigation bar because generating is the thing a human repeats here. All
/// state lives in the `AvatarGenerationSession` the Settings sheet keeps for
/// this Agent, so closing this sheet never cancels a drawing.
struct AgentAvatarGenerationView: View {
    let agentName: String
    let currentAvatarURL: URL?
    let initials: String
    @Bindable var session: AvatarGenerationSession
    let onGenerate: @Sendable (String) async throws -> AvatarImagePayload
    let onSave: @Sendable (AvatarImagePayload) async throws -> Void

    @Environment(\.dismiss) private var dismiss
    @FocusState private var conceptFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    AvatarGenerationStage(
                        agentName: agentName,
                        currentAvatarURL: currentAvatarURL,
                        initials: initials,
                        session: session
                    )
                    .padding(.top, 8)

                    conceptCard

                    generateButton
                }
                .padding(.vertical, 8)
                .padding(.bottom, 16)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .background(HausPlatformColor.groupedBackground)
            .navigationTitle("Generate avatar")
            .hausInlineNavigationTitle()
            // A drawing takes tens of seconds and keeps going in the session,
            // so leaving is allowed the whole time — only the save itself,
            // which writes the Agent's avatar, holds the sheet open.
            .interactiveDismissDisabled(session.isSaving)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(session.isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task {
                            if await session.save(using: onSave) {
                                dismiss()
                            }
                        }
                    } label: {
                        if session.isSaving {
                            ProgressView()
                        } else {
                            Text("Save")
                        }
                    }
                    .disabled(!session.canSave)
                    .accessibilityLabel("Save avatar")
                    .accessibilityIdentifier("save-generated-avatar")
                }
                // A vertical-axis field spends Return on a newline, so the
                // keyboard needs its own way out.
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { conceptFocused = false }
                }
            }
            .alert("Couldn't save avatar", isPresented: saveErrorPresented) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(session.saveError ?? "")
            }
            .sensoryFeedback(.success, trigger: session.variants.count)
        }
    }

    private var conceptCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Concept")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 16)

            VStack(alignment: .leading, spacing: 12) {
                TextField(
                    "e.g. a moonlit fox cartographer",
                    text: $session.concept,
                    axis: .vertical
                )
                .font(.body)
                .lineLimit(2 ... 5)
                .focused($conceptFocused)
                .accessibilityLabel("Avatar concept")

                // Always laid out, so clearing or filling the field never
                // moves Generate; hidden once there is a concept to act on.
                Group {
                    Divider()
                    AvatarConceptSuggestions { session.concept = $0 }
                }
                .opacity(showsSuggestions ? 1 : 0)
                .allowsHitTesting(showsSuggestions)
                .accessibilityHidden(!showsSuggestions)
            }
            .padding(16)
            .background(HausPlatformColor.groupedSurface, in: .haus(HausRadius.grouped))
            .padding(.horizontal, 16)
            .animation(.snappy(duration: 0.2), value: showsSuggestions)

            conceptFooter
        }
    }

    /// The help line reads as a grouped-list footer: outside the card, on the
    /// section's rail, at the same size as the rest of the screen's prose.
    private var conceptFooter: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text("Describe a character and get a pixel-art portrait. Try a few; nothing changes until you use one.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("avatar-concept-help")

            Spacer(minLength: 0)

            if session.concept.count >= AvatarGenerationConcept.counterThreshold {
                Text("\(session.concept.count)/\(AvatarGenerationConcept.maxLength)")
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, 16)
    }

    /// The only action the content owns. Save belongs in the navigation bar,
    /// where a sheet's confirming action lives, which also keeps both controls
    /// clear of the keyboard the concept field raises.
    private var generateButton: some View {
        Button {
            conceptFocused = false
            session.generate(using: onGenerate)
        } label: {
            HStack(spacing: 8) {
                if session.isGenerating {
                    // A prominent pill paints its own label white; a
                    // ProgressView keeps the system grey unless told.
                    ProgressView()
                        .controlSize(.small)
                        .tint(.white)
                } else {
                    HausIcon(.magic, size: 19, weight: 1.9)
                }
                Text(generateTitle)
                    .font(.body.weight(.semibold))
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.capsule)
        .controlSize(.large)
        .disabled(!session.canGenerate)
        .padding(.horizontal, 16)
        .accessibilityIdentifier("generate-avatar-preview")
    }

    private var generateTitle: String {
        if session.isGenerating {
            return "Generating…"
        }
        return session.variants.isEmpty ? "Generate preview" : "Generate another"
    }

    private var showsSuggestions: Bool {
        session.concept.isEmpty
    }

    private var saveErrorPresented: Binding<Bool> {
        Binding(
            get: { session.saveError != nil },
            set: { if !$0 { session.saveError = nil } }
        )
    }
}
