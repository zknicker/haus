import HausModels
import Intents
import UserNotifications

/// Builds the incoming-message intent iOS renders as a communication
/// notification, and donates it so the system accepts the sender's avatar.
enum CommunicationNotification {
    /// Nil when iOS rejects the intent; the caller delivers the original push.
    static func content(
        from original: UNNotificationContent,
        communication: PushNotificationCommunication
    ) async -> UNNotificationContent? {
        let image = await SenderAvatar.image(for: communication.sender)
        guard !Task.isCancelled else { return nil }
        let intent = sendMessageIntent(communication, body: original.body, image: image)
        let interaction = INInteraction(intent: intent, response: nil)
        interaction.direction = .incoming
        do {
            try await interaction.donate()
        } catch {
            // A failed donation still leaves a renderable intent.
            NotificationService.logger.error("interaction donation failed: \(error.localizedDescription, privacy: .public)")
        }
        do {
            return try original.updating(from: intent)
        } catch {
            NotificationService.logger.error("communication update failed: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    private static func sendMessageIntent(
        _ communication: PushNotificationCommunication,
        body: String,
        image: INImage?
    ) -> INSendMessageIntent {
        let sender = INPerson(
            personHandle: INPersonHandle(value: communication.sender.id, type: .unknown),
            nameComponents: nil,
            displayName: communication.sender.name,
            image: image,
            contactIdentifier: nil,
            customIdentifier: communication.sender.id
        )
        let intent = INSendMessageIntent(
            recipients: recipients(for: communication.conversation),
            outgoingMessageType: .outgoingMessageText,
            content: body,
            speakableGroupName: communication.conversation.groupName.map { INSpeakableString(spokenPhrase: $0) },
            conversationIdentifier: communication.conversationIdentifier,
            serviceName: nil,
            sender: sender,
            attachments: nil
        )
        if let image {
            intent.setImage(image, forParameterNamed: \.sender)
        }
        if let signals = communication.focusSignals {
            let metadata = INSendMessageIntentDonationMetadata()
            metadata.mentionsCurrentUser = signals.mentionsCurrentUser
            metadata.isReplyToCurrentUser = signals.isReplyToCurrentUser
            intent.donationMetadata = metadata
        }
        NotificationService.logger.info(
            "focus reason \(communication.reason?.rawValue ?? "unknown", privacy: .public), metadata \(intent.donationMetadata != nil, privacy: .public)"
        )
        return intent
    }

    /// A DM is one-to-one. iOS renders a group title only for a conversation
    /// with more than one recipient, so a Channel adds a stand-in member.
    private static func recipients(for conversation: PushNotificationCommunication.Conversation) -> [INPerson] {
        let me = person(handle: "me", isMe: true)
        switch conversation {
        case .dm:
            return [me]
        case .channel:
            return [me, person(handle: "channel-members", isMe: false)]
        }
    }

    private static func person(handle: String, isMe: Bool) -> INPerson {
        INPerson(
            personHandle: INPersonHandle(value: handle, type: .unknown),
            nameComponents: nil,
            displayName: nil,
            image: nil,
            contactIdentifier: nil,
            customIdentifier: nil,
            isMe: isMe
        )
    }
}
