import SwiftUI

struct DescriptionEditorView: View {
    let title: String
    let value: String
    let onSave: (String) async throws -> Void
    @FocusState private var isFocused: Bool
    @State private var draft: String
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(title: String, value: String, onSave: @escaping (String) async throws -> Void) {
        self.title = title
        self.value = value
        self.onSave = onSave
        _draft = State(initialValue: value)
    }

    private var hasChanges: Bool {
        draft != value
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack(alignment: .topLeading) {
                TextEditor(text: $draft)
                    .font(.body)
                    .foregroundStyle(.primary)
                    .scrollContentBackground(.hidden)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .focused($isFocused)
                    .accessibilityLabel(title)

                if draft.isEmpty {
                    Text("Add a description…")
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 17)
                        .padding(.top, 18)
                        .allowsHitTesting(false)
                }
            }
            .background(HausPlatformColor.groupedSurface, in: .haus(HausRadius.grouped))

            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .padding(.horizontal, 16)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 16)
        .background(HausPlatformColor.groupedBackground)
        .navigationTitle(title)
        .hausInlineNavigationTitle()
        .toolbar {
            ToolbarItem(placement: .automatic) {
                Button {
                    Task { await saveDraft() }
                } label: {
                    if isSaving {
                        ProgressView()
                    } else {
                        Text("Save")
                    }
                }
                .disabled(!hasChanges || isSaving)
                .fontWeight(.semibold)
                .accessibilityLabel("Save \(title)")
            }
        }
        .task {
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard !Task.isCancelled else { return }
            isFocused = true
        }
        .onDisappear {
            isFocused = false
        }
    }

    private func saveDraft() async {
        guard hasChanges, !isSaving else { return }

        isSaving = true
        errorMessage = nil
        do {
            try await onSave(draft)
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }
}

#Preview("Description editor") {
    NavigationStack {
        DescriptionEditorView(title: "Description", value: "") { _ in }
    }
}
