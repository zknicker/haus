import SwiftUI

/// A follow-up the person typed, with the nonce that keeps a resend of the
/// same text one follow-up.
public struct WorkerFollowUpDraft: Equatable, Sendable {
    public let text: String
    public let nonce: String
}

/// The Worker's docked composer. Its send button turns into Stop Worker while
/// a turn runs and the field is empty.
struct WorkerFollowUpComposer: View {
    @Binding var text: String
    let placeholder: String
    let liveTurn: WorkerLiveTurn?
    let attach: (() -> Void)?
    let send: (WorkerFollowUpDraft) async throws -> Void
    let stop: () async throws -> Void

    @State private var nonce: String?
    @State private var sending = false
    @State private var stopHeldFor: String?
    @State private var stopSentFor: String?
    @State private var failure: String?
    @ScaledMetric(relativeTo: .body) private var controlDiameter: CGFloat = 36

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let failure {
                Text(failure)
                    .font(.footnote)
                    .foregroundStyle(HausPlatformColor.critical)
                    .padding(.horizontal, 12)
                    .transition(.opacity)
            }
            HStack(alignment: .bottom, spacing: 8) {
                if let attach {
                    ComposerCircleButton(icon: .plus, style: .plus(isEnabled: true), label: "Add attachment", action: attach)
                }
                field
                trailingButton
            }
            .padding(ComposerSurfaceMetrics.restingControlInset)
            .composerGlassSurface(cornerRadius: ComposerSurfaceMetrics.restingCornerRadius)
        }
        .padding(.horizontal, ComposerSurfaceMetrics.sideMargin)
    }

    private var typedText: Binding<String> {
        Binding {
            text
        } set: { value in
            text = value
            nonce = nil
            stopHeldFor = nil
            failure = nil
        }
    }

    private var controls: WorkerFollowUpControls {
        let turnId = liveTurn?.turnId
        return WorkerFollowUpControls(
            canStop: liveTurn.map { !$0.stopRequested && stopSentFor != $0.turnId } ?? false,
            draft: text,
            sending: sending,
            stopHeld: turnId != nil && stopHeldFor == turnId
        )
    }

    private var field: some View {
        TextField(placeholder, text: typedText, axis: .vertical)
            .lineLimit(1...6)
            .font(.body)
            .foregroundStyle(HausPlatformColor.ink)
            .padding(.leading, attach == nil ? 10 : 0)
            .frame(minHeight: controlDiameter)
            .accessibilityLabel(placeholder)
    }

    @ViewBuilder
    private var trailingButton: some View {
        let controls = controls
        if controls.stops {
            WorkerStopButton(diameter: controlDiameter, action: requestStop)
                .transition(.opacity)
        } else {
            ComposerCircleButton(
                icon: .send,
                style: .send(canSend: !controls.isDisabled),
                label: controls.label,
                action: submit
            )
            .disabled(controls.isDisabled)
        }
    }

    private func submit() {
        let draft = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !draft.isEmpty, !sending else { return }
        let sent = text
        let key = nonce ?? UUID().uuidString
        nonce = key
        sending = true
        let heldTurn = liveTurn?.turnId
        Task {
            do {
                try await send(WorkerFollowUpDraft(text: draft, nonce: key))
                sending = false
                nonce = nil
                if text == sent { text = "" }
                stopHeldFor = heldTurn
            } catch {
                sending = false
                failure = "Could not send the follow-up"
            }
        }
    }

    private func requestStop() {
        guard controls.stops, let turnId = liveTurn?.turnId else { return }
        stopSentFor = turnId
        Task {
            do {
                try await stop()
            } catch {
                stopSentFor = nil
                failure = "Could not stop this Worker"
            }
        }
    }
}

/// The foreground-filled circle with a stop square: the Stop Worker control.
struct WorkerStopButton: View {
    let diameter: CGFloat
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Circle()
                .fill(HausPlatformColor.ink)
                .frame(width: diameter, height: diameter)
                .overlay {
                    RoundedRectangle(cornerRadius: diameter * 0.09)
                        .fill(HausPlatformColor.canvas)
                        .frame(width: diameter * 0.33, height: diameter * 0.33)
                }
                .contentShape(.circle)
        }
        .buttonStyle(.pressable)
        .accessibilityLabel("Stop Worker")
    }
}
