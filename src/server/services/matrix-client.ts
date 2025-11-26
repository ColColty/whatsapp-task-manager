import * as sdk from "matrix-js-sdk";
import { env } from "~/env";

/**
 * Matrix Client Singleton for WhatsApp Bridge Integration
 * Manages connection to Beeper/Matrix and provides WhatsApp operations via mautrix-whatsapp bridge
 */
class MatrixClientService {
  private client: sdk.MatrixClient | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  /**
   * Initialize the Matrix client
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
      // Create Matrix client with Beeper credentials
      this.client = sdk.createClient({
        baseUrl: env.MATRIX_HOMESERVER_URL,
        accessToken: env.MATRIX_ACCESS_TOKEN,
        userId: env.MATRIX_USER_ID,
        deviceId: env.MATRIX_DEVICE_ID,
      });

      // Start the client
      await this.client.startClient({ initialSyncLimit: 10 });

      // Wait for client to sync
      await new Promise<void>((resolve) => {
        this.client!.once(sdk.ClientEvent.Sync, (state) => {
          if (state === "PREPARED") {
            console.log("Matrix client synced and ready");
            resolve();
          }
        });
      });

      this.isInitialized = true;
    } catch (error) {
      this.initializationPromise = null;
      console.error("Failed to initialize Matrix client:", error);
      throw error;
    }
  }

  /**
   * Get the Matrix client instance
   */
  getClient(): sdk.MatrixClient {
    if (!this.client) {
      throw new Error("Matrix client not initialized. Call initialize() first.");
    }
    return this.client;
  }

  /**
   * Create a Matrix room that will be bridged to a WhatsApp group
   * @param name - Name of the group
   * @param userIds - Array of Matrix user IDs to invite
   * @returns Room ID
   */
  async createRoom(name: string, userIds: string[]): Promise<string> {
    await this.initialize();
    const client = this.getClient();

    // Create a Matrix room
    const room = await client.createRoom({
      name,
      invite: userIds,
      visibility: sdk.Visibility.Private,
      preset: sdk.Preset.PrivateChat,
    });

    return room.room_id;
  }

  /**
   * Convert a Matrix room to a WhatsApp group using the bridge
   * @param roomId - Matrix room ID
   */
  async createWhatsAppGroup(roomId: string): Promise<void> {
    await this.initialize();
    const client = this.getClient();

    // Send the !wa create command to the room
    await client.sendMessage(roomId, {
      msgtype: "m.text",
      body: "!wa create",
    });

    // Wait a bit for the bridge to process the command
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  /**
   * Send a text message to a room (which will be bridged to WhatsApp)
   * @param roomId - Matrix room ID
   * @param message - Message text
   */
  async sendMessage(roomId: string, message: string): Promise<string> {
    await this.initialize();
    const client = this.getClient();

    const response = await client.sendMessage(roomId, {
      msgtype: "m.text",
      body: message,
    });

    return response.event_id;
  }

  /**
   * Send a message with a task assignment
   * @param roomId - Matrix room ID
   * @param taskTitle - Task title
   * @param taskDescription - Task description
   * @param assignee - Username of assignee
   * @param customMessage - Optional custom message to send instead of the default template
   */
  async sendTaskAssignment(
    roomId: string,
    taskTitle: string,
    taskDescription: string,
    assignee?: string,
    customMessage?: string,
  ): Promise<string> {
    // Use custom message if provided, otherwise use default template
    const message = customMessage
      ? customMessage
      : assignee
        ? `📋 New Task: ${taskTitle}\n\n${taskDescription}\n\n👤 Assigned to: ${assignee}\n\nReply to this message with updates or attach photos/videos of your progress!`
        : `📋 New Task: ${taskTitle}\n\n${taskDescription}\n\nReply to this message with updates or attach photos/videos of your progress!`;

    return this.sendMessage(roomId, message);
  }

  /**
   * Send a media message (image, video, document)
   * @param roomId - Matrix room ID
   * @param mediaUrl - URL or file path to media
   * @param mimeType - MIME type of the media
   * @param fileName - File name
   */
  async sendMedia(
    roomId: string,
    mediaUrl: string,
    mimeType: string,
    fileName: string,
  ): Promise<string> {
    await this.initialize();
    const client = this.getClient();

    // Upload media to Matrix homeserver
    const uploadResponse = await client.uploadContent(
      await fetch(mediaUrl).then((r) => r.blob()),
      { name: fileName, type: mimeType },
    );

    // Determine message type based on MIME type
    let msgtype = "m.file";
    if (mimeType.startsWith("image/")) {
      msgtype = "m.image";
    } else if (mimeType.startsWith("video/")) {
      msgtype = "m.video";
    } else if (mimeType.startsWith("audio/")) {
      msgtype = "m.audio";
    }

    // Send the media message
    const response = await client.sendMessage(roomId, {
      msgtype,
      body: fileName,
      url: uploadResponse.content_uri,
      info: {
        mimetype: mimeType,
      },
    });

    return response.event_id;
  }

  /**
   * Get room members
   * @param roomId - Matrix room ID
   */
  async getRoomMembers(roomId: string): Promise<string[]> {
    await this.initialize();
    const client = this.getClient();

    const room = client.getRoom(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    const members = room.getMembers();
    return members
      .filter((m) => m.membership === "join" || m.membership === "invite")
      .map((m) => m.userId);
  }

  /**
   * Invite a user to a room
   * @param roomId - Matrix room ID
   * @param userId - Matrix user ID to invite
   */
  async inviteUser(roomId: string, userId: string): Promise<void> {
    await this.initialize();
    const client = this.getClient();
    await client.invite(roomId, userId);
  }

  /**
   * Register a callback for incoming messages
   * @param callback - Function to call when a message is received
   */
  onMessage(
    callback: (
      event: sdk.MatrixEvent,
      room: sdk.Room,
      sender: string,
    ) => void | Promise<void>,
  ): void {
    if (!this.client) {
      throw new Error("Matrix client not initialized");
    }

    this.client.on(
      sdk.RoomEvent.Timeline,
      async (event: sdk.MatrixEvent, room: sdk.Room | undefined) => {
        // Only process new messages (not historical)
        if (event.getType() !== "m.room.message" || !room) {
          return;
        }

        // Don't process our own messages
        if (event.getSender() === env.MATRIX_USER_ID) {
          return;
        }

        await callback(event, room, event.getSender()!);
      },
    );
  }

  /**
   * Download media from a message event
   * @param event - Matrix event containing media
   */
  async downloadMedia(event: sdk.MatrixEvent): Promise<{
    data: ArrayBuffer;
    contentType: string;
    fileName: string;
  }> {
    await this.initialize();
    const client = this.getClient();

    const content = event.getContent();
    const mxcUrl = content.url;

    if (!mxcUrl) {
      throw new Error("No media URL in event");
    }

    // Get HTTP URL from MXC URL
    const httpUrl = client.mxcUrlToHttp(mxcUrl);
    if (!httpUrl) {
      throw new Error("Failed to convert MXC URL to HTTP URL");
    }

    // Download the media
    const response = await fetch(httpUrl);
    const data = await response.arrayBuffer();

    return {
      data,
      contentType: content.info?.mimetype ?? "application/octet-stream",
      fileName: content.body ?? "file",
    };
  }

  /**
   * Stop the Matrix client
   */
  async stop(): Promise<void> {
    if (this.client) {
      this.client.stopClient();
      this.client = null;
      this.isInitialized = false;
      this.initializationPromise = null;
    }
  }
}

// Export singleton instance
export const matrixClient = new MatrixClientService();
