export interface AttachmentRecord {
    computerId: string;
    serverId: string;
    serverOrigin: string;
    slug: string;
}

export interface Attachment extends AttachmentRecord {
    credential: string;
}
