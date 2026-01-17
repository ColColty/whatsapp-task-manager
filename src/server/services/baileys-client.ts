import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  proto,
  downloadMediaMessage,
  isJidGroup,
  BaileysEventMap,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { join } from "path";

/**
 * Baileys WhatsApp Client Singleton
 * Manages direct connection to WhatsApp Web API via Baileys
 */
class BaileysWhatsAppClient {
  private sock: WASocket | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private sessionPath = join(process.cwd(), "whatsapp-session");
  private messageHandlers: Array<
    (message: proto.IWebMessageInfo) => void | Promise<void>
  > = [];

  /**
   * Initialize the WhatsApp client
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._initialize();
    return this.initializationPromise;
  }

  private async _initialize(): Promise<void> {
    try {
      console.log("Initializing Baileys WhatsApp client...");

      // Load authentication state
      const { state, saveCreds } = await useMultiFileAuthState(
        this.sessionPath,
      );

      // Create WhatsApp socket connection
      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // Print QR code in terminal for first-time login
        browser: ["Task Manager", "Chrome", "1.0.0"],
      });

      // Save credentials on update
      this.sock.ev.on("creds.update", saveCreds);

      // Handle connection updates
      this.sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          console.log("QR Code generated - scan with WhatsApp:");
        }

        if (connection === "close") {
          const shouldReconnect =
            (lastDisconnect?.error as Boom)?.output?.statusCode !==
            DisconnectReason.loggedOut;

          console.log(
            "Connection closed due to:",
            lastDisconnect?.error,
            ", reconnecting:",
            shouldReconnect,
          );

          if (shouldReconnect) {
            // Reconnect
            this.isInitialized = false;
            this.initializationPromise = null;
            await this.initialize();
          }
        } else if (connection === "open") {
          console.log("WhatsApp connection opened successfully!");
          this.isInitialized = true;
        }
      });

      // Handle incoming messages
      this.sock.ev.on("messages.upsert", async ({ messages, type }) => {
        // Only process new messages
        if (type !== "notify") return;

        for (const message of messages) {
          // Don't process our own messages
          if (message.key.fromMe) continue;

          // Call all registered handlers
          for (const handler of this.messageHandlers) {
            try {
              await handler(message);
            } catch (error) {
              console.error("Error in message handler:", error);
            }
          }
        }
      });

      // Wait for connection to open
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("WhatsApp connection timeout"));
        }, 60000); // 60 second timeout

        const checkConnection = () => {
          if (this.isInitialized) {
            clearTimeout(timeout);
            resolve();
          } else {
            setTimeout(checkConnection, 500);
          }
        };

        checkConnection();
      });
    } catch (error) {
      this.initializationPromise = null;
      console.error("Failed to initialize WhatsApp client:", error);
      throw error;
    }
  }

  /**
   * Get the WhatsApp socket instance
   */
  getSocket(): WASocket {
    if (!this.sock) {
      throw new Error(
        "WhatsApp client not initialized. Call initialize() first.",
      );
    }
    return this.sock;
  }

  /**
   * Create a WhatsApp group
   * @param name - Name of the group
   * @param participants - Array of phone numbers (with country code, no + or spaces)
   * @returns Group JID (e.g., "120363123456789@g.us")
   */
  async createGroup(name: string, participants: string[]): Promise<string> {
    await this.initialize();
    const sock = this.getSocket();

    // Ensure participants are in correct JID format
    const participantJids = participants.map((phone) => {
      // Remove any non-numeric characters
      const cleanPhone = phone.replace(/\D/g, "");
      return `${cleanPhone}@s.whatsapp.net`;
    });

    // Create the group
    const group = await sock.groupCreate(name, participantJids);

    if (!group?.id) {
      throw new Error("Failed to create WhatsApp group");
    }

    return group.id;
  }

  /**
   * Send a text message to a chat or group
   * @param jid - WhatsApp JID (group or personal)
   * @param message - Message text
   * @returns Message ID
   */
  async sendMessage(jid: string, message: string): Promise<string> {
    await this.initialize();
    const sock = this.getSocket();

    const sentMessage = await sock.sendMessage(jid, {
      text: message,
    });

    return sentMessage?.key?.id ?? "";
  }

  /**
   * Send a task assignment message
   * @param jid - WhatsApp JID
   * @param taskTitle - Task title
   * @param taskDescription - Task description
   * @param assignee - Name of assignee
   * @returns Message ID
   */
  async sendTaskAssignment(
    jid: string,
    taskTitle: string,
    taskDescription: string,
    assignee?: string,
  ): Promise<string> {
    const message = assignee
      ? `📋 *New Task: ${taskTitle}*\n\n${taskDescription}\n\n👤 *Assigned to:* ${assignee}\n\nReply to this message with updates or attach photos/videos of your progress!`
      : `📋 *New Task: ${taskTitle}*\n\n${taskDescription}\n\nReply to this message with updates or attach photos/videos of your progress!`;

    return this.sendMessage(jid, message);
  }

  /**
   * Send media (image, video, document)
   * @param jid - WhatsApp JID
   * @param mediaBuffer - Media file buffer
   * @param mimeType - MIME type
   * @param caption - Optional caption
   * @param fileName - File name
   * @returns Message ID
   */
  async sendMedia(
    jid: string,
    mediaBuffer: Buffer,
    mimeType: string,
    caption?: string,
    fileName?: string,
  ): Promise<string> {
    await this.initialize();
    const sock = this.getSocket();

    let messageContent: any = { caption };

    if (mimeType.startsWith("image/")) {
      messageContent = {
        image: mediaBuffer,
        caption,
      };
    } else if (mimeType.startsWith("video/")) {
      messageContent = {
        video: mediaBuffer,
        caption,
      };
    } else if (mimeType.startsWith("audio/")) {
      messageContent = {
        audio: mediaBuffer,
        mimetype: mimeType,
      };
    } else {
      messageContent = {
        document: mediaBuffer,
        mimetype: mimeType,
        fileName: fileName ?? "file",
      };
    }

    const sentMessage = await sock.sendMessage(jid, messageContent);

    return sentMessage?.key?.id ?? "";
  }

  /**
   * Get group participants
   * @param groupJid - Group JID
   * @returns Array of participant JIDs
   */
  async getGroupParticipants(groupJid: string): Promise<string[]> {
    await this.initialize();
    const sock = this.getSocket();

    if (!isJidGroup(groupJid)) {
      throw new Error("JID is not a group");
    }

    const metadata = await sock.groupMetadata(groupJid);
    return metadata.participants.map((p) => p.id);
  }

  /**
   * Add a participant to a group
   * @param groupJid - Group JID
   * @param participantPhone - Phone number to add
   */
  async addParticipant(
    groupJid: string,
    participantPhone: string,
  ): Promise<void> {
    await this.initialize();
    const sock = this.getSocket();

    const cleanPhone = participantPhone.replace(/\D/g, "");
    const participantJid = `${cleanPhone}@s.whatsapp.net`;

    await sock.groupParticipantsUpdate(groupJid, [participantJid], "add");
  }

  /**
   * Remove a participant from a group
   * @param groupJid - Group JID
   * @param participantPhone - Phone number to remove
   */
  async removeParticipant(
    groupJid: string,
    participantPhone: string,
  ): Promise<void> {
    await this.initialize();
    const sock = this.getSocket();

    const cleanPhone = participantPhone.replace(/\D/g, "");
    const participantJid = `${cleanPhone}@s.whatsapp.net`;

    await sock.groupParticipantsUpdate(groupJid, [participantJid], "remove");
  }

  /**
   * Register a callback for incoming messages
   * @param callback - Function to call when a message is received
   */
  onMessage(
    callback: (message: proto.IWebMessageInfo) => void | Promise<void>,
  ): void {
    this.messageHandlers.push(callback);
  }

  /**
   * Download media from a message
   * @param message - WhatsApp message containing media
   * @returns Media buffer and metadata
   */
  async downloadMedia(message: proto.IWebMessageInfo): Promise<{
    data: Buffer;
    contentType: string;
    fileName: string;
  }> {
    const buffer = await downloadMediaMessage(
      message as any, // Cast to handle type compatibility
      "buffer",
      {},
      {
        logger: console as any,
        reuploadRequest: this.getSocket().updateMediaMessage,
      },
    );

    // Determine content type and file name
    const messageContent = message.message;
    let contentType = "application/octet-stream";
    let fileName = "file";

    if (messageContent?.imageMessage) {
      contentType = messageContent.imageMessage.mimetype ?? "image/jpeg";
      fileName = "image.jpg";
    } else if (messageContent?.videoMessage) {
      contentType = messageContent.videoMessage.mimetype ?? "video/mp4";
      fileName = "video.mp4";
    } else if (messageContent?.audioMessage) {
      contentType = messageContent.audioMessage.mimetype ?? "audio/ogg";
      fileName = "audio.ogg";
    } else if (messageContent?.documentMessage) {
      contentType =
        messageContent.documentMessage.mimetype ?? "application/octet-stream";
      fileName = messageContent.documentMessage.fileName ?? "document";
    }

    return {
      data: buffer as Buffer,
      contentType,
      fileName,
    };
  }

  /**
   * Check if a JID is a group
   * @param jid - WhatsApp JID
   */
  isGroup(jid: string): boolean {
    return isJidGroup(jid) ?? false;
  }

  /**
   * Get phone number from JID
   * @param jid - WhatsApp JID
   */
  getPhoneFromJid(jid: string): string {
    return jid.split("@")[0] ?? "";
  }

  /**
   * Convert phone number to JID
   * @param phone - Phone number (with country code)
   */
  phoneToJid(phone: string): string {
    const cleanPhone = phone.replace(/\D/g, "");
    return `${cleanPhone}@s.whatsapp.net`;
  }

  /**
   * Stop the WhatsApp client
   */
  async stop(): Promise<void> {
    if (this.sock) {
      await this.sock.logout();
      this.sock = null;
      this.isInitialized = false;
      this.initializationPromise = null;
      this.messageHandlers = [];
    }
  }
}

// Export singleton instance
export const baileysClient = new BaileysWhatsAppClient();
