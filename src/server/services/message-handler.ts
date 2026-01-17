import { baileysClient } from "./baileys-client";
import { db } from "../db";
import type { proto } from "@whiskeysockets/baileys";
import {
  conversations,
  tasks,
  taskUpdates,
  taskAttachments,
  assignedUsers,
  type messageTypeEnum,
  type taskStatusEnum,
} from "../db/schema";
import { eq, and, or, desc } from "drizzle-orm";

type MessageType = typeof messageTypeEnum.enumValues[number];
type TaskStatus = typeof taskStatusEnum.enumValues[number];

/**
 * Message Handler Service
 * Processes incoming WhatsApp messages from Baileys
 */
export class MessageHandlerService {
  private isListening = false;

  /**
   * Start listening for incoming messages
   */
  async startListening() {
    if (this.isListening) {
      console.log("Message handler already listening");
      return;
    }

    await baileysClient.initialize();

    baileysClient.onMessage(async (message) => {
      try {
        await this.handleMessage(message);
      } catch (error) {
        console.error("Error handling message:", error);
      }
    });

    this.isListening = true;
    console.log("Message handler started listening for WhatsApp messages");
  }

  /**
   * Handle an incoming message
   */
  private async handleMessage(message: proto.IWebMessageInfo) {
    const messageContent = message.message;
    if (!messageContent) return;

    // Extract message details
    if (!message.key) return;

    const messageId = message.key.id;
    const remoteJid = message.key.remoteJid; // Group or personal chat JID
    const senderJid = message.key.participant || message.key.remoteJid; // Sender's JID

    if (!messageId || !remoteJid || !senderJid) return;

    // Get message text
    const messageBody =
      messageContent.conversation ||
      messageContent.extendedTextMessage?.text ||
      messageContent.imageMessage?.caption ||
      messageContent.videoMessage?.caption ||
      "";

    if (!messageBody && !this.hasMedia(messageContent)) {
      return; // Ignore messages without text or media
    }

    // Get conversation by WhatsApp JID
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.matrixRoomId, remoteJid)) // matrixRoomId stores WhatsApp JID
      .limit(1);

    if (!conversation) {
      console.log(`Ignoring message from untracked conversation: ${remoteJid}`);
      return;
    }

    // Get sender phone number from JID
    const senderPhone = baileysClient.getPhoneFromJid(senderJid);

    // Get sender from assigned users (only track messages from workers, not managers)
    const [assignedUser] = await db
      .select()
      .from(assignedUsers)
      .where(eq(assignedUsers.phoneNumber, senderPhone))
      .limit(1);

    if (!assignedUser) {
      console.log(`Ignoring message from non-assigned user: ${senderPhone}`);
      return;
    }

    // Check if message already exists (prevent duplicates)
    const existingUpdate = await db.query.taskUpdates.findFirst({
      where: eq(taskUpdates.matrixEventId, messageId), // matrixEventId stores WhatsApp message ID
    });

    if (existingUpdate) {
      console.log(`Message already processed: ${messageId}`);
      return;
    }

    // Determine message type
    const messageType = this.getMessageType(messageContent);

    // Check if this is a reply or quote
    const quotedMessageId =
      messageContent.extendedTextMessage?.contextInfo?.stanzaId;
    let taskId: string | undefined;

    if (quotedMessageId) {
      // Find task by its WhatsApp message ID
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.matrixEventId, quotedMessageId)) // matrixEventId stores WhatsApp message ID
        .limit(1);

      if (task) {
        taskId = task.id;
      }
    }

    // If no task found via reply, find the most recent pending task for this user in this conversation
    if (!taskId) {
      const userTasks = await db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.conversationId, conversation.id),
            eq(tasks.assignedUserId, assignedUser.id),
            or(eq(tasks.status, "TODO"), eq(tasks.status, "IN_PROGRESS")),
          ),
        )
        .orderBy(desc(tasks.createdAt))
        .limit(1);

      if (userTasks.length > 0) {
        taskId = userTasks[0]!.id;
      }
    }

    // Skip if no task is associated
    if (!taskId) {
      console.log("No task found for message, skipping");
      return;
    }

    // Analyze message content with AI
    const aiAnalysis = await this.analyzeMessageWithAI(messageBody, taskId);

    // Save task update to database
    const [taskUpdate] = await db
      .insert(taskUpdates)
      .values({
        taskId: taskId,
        assignedUserId: assignedUser.id,
        whatsappMessageId: messageId,
        matrixEventId: messageId, // Store WhatsApp message ID here
        messageText: messageBody || "[Media]",
        messageType,
        analyzedByAI: true,
        aiAnalysis,
      })
      .returning();

    // Handle attachments if present
    if (this.hasMedia(messageContent) && taskUpdate) {
      await this.handleAttachment(message, taskUpdate.id, taskId);
    }

    // Update task status based on AI analysis
    if (taskId && aiAnalysis && aiAnalysis.status) {
      await this.updateTaskBasedOnAnalysis(taskId, aiAnalysis);
    }

    console.log(
      `Processed message: ${messageId} for task: ${taskId ?? "none"}`,
    );
  }

  /**
   * Check if message has media
   */
  private hasMedia(messageContent: proto.IMessage): boolean {
    return !!(
      messageContent.imageMessage ||
      messageContent.videoMessage ||
      messageContent.audioMessage ||
      messageContent.documentMessage
    );
  }

  /**
   * Determine message type from content
   */
  private getMessageType(messageContent: proto.IMessage): MessageType {
    if (messageContent.imageMessage) return "IMAGE";
    if (messageContent.videoMessage) return "VIDEO";
    if (messageContent.audioMessage) return "AUDIO";
    if (messageContent.documentMessage) return "DOCUMENT";

    return "TEXT";
  }

  /**
   * Analyze message content using AI to determine intent and task status
   */
  private async analyzeMessageWithAI(
    messageBody: string,
    taskId?: string,
  ): Promise<{
    status?: "todo" | "in_progress" | "done" | "blocked" | "feedback_needed";
    sentiment?: "positive" | "neutral" | "negative";
    progress?: number;
    summary?: string;
    keywords?: string[];
  }> {
    // Simple keyword-based analysis (replace with actual LLM API call)
    const lowerMessage = messageBody.toLowerCase();

    // Check for completion indicators
    const completionKeywords = [
      "done",
      "finished",
      "completed",
      "complete",
      "ready",
    ];
    const hasCompletionKeyword = completionKeywords.some((kw) =>
      lowerMessage.includes(kw),
    );

    // Check for progress indicators
    const progressKeywords = [
      "working on",
      "in progress",
      "started",
      "doing",
      "currently",
    ];
    const hasProgressKeyword = progressKeywords.some((kw) =>
      lowerMessage.includes(kw),
    );

    // Check for blocked indicators
    const blockedKeywords = [
      "blocked",
      "stuck",
      "can't",
      "cannot",
      "problem",
      "issue",
    ];
    const hasBlockedKeyword = blockedKeywords.some((kw) =>
      lowerMessage.includes(kw),
    );

    // Check for feedback needed
    const feedbackKeywords = ["help", "question", "?", "how", "what"];
    const needsFeedback = feedbackKeywords.some((kw) =>
      lowerMessage.includes(kw),
    );

    // Determine status (lowercase for database schema)
    let status: "todo" | "in_progress" | "done" | "blocked" | "feedback_needed" | undefined;
    let confidence = 0.5;

    if (hasCompletionKeyword && taskId) {
      status = "done";
      confidence = 0.9;
    } else if (hasBlockedKeyword && taskId) {
      status = "blocked";
      confidence = 0.85;
    } else if (needsFeedback && taskId) {
      status = "feedback_needed";
      confidence = 0.8;
    } else if (hasProgressKeyword && taskId) {
      status = "in_progress";
      confidence = 0.75;
    }

    return {
      status,
      sentiment: hasCompletionKeyword ? "positive" : "neutral",
      progress: hasCompletionKeyword ? 100 : hasProgressKeyword ? 50 : undefined,
      summary: messageBody.substring(0, 100),
      keywords: [
        ...completionKeywords.filter((k) => lowerMessage.includes(k)),
        ...progressKeywords.filter((k) => lowerMessage.includes(k)),
        ...blockedKeywords.filter((k) => lowerMessage.includes(k)),
      ],
    };
  }

  /**
   * Update task status based on AI analysis
   */
  private async updateTaskBasedOnAnalysis(
    taskId: string,
    analysis: {
      status?: "todo" | "in_progress" | "done" | "blocked" | "feedback_needed";
      confidence?: number;
    },
  ) {
    // Only auto-update if status is provided
    if (!analysis.status) {
      return;
    }

    // Convert lowercase AI status to uppercase TaskStatus
    const statusMap: Record<string, TaskStatus> = {
      todo: "TODO",
      in_progress: "IN_PROGRESS",
      done: "DONE",
      blocked: "BLOCKED",
      feedback_needed: "FEEDBACK_NEEDED",
    };

    const taskStatus = statusMap[analysis.status];
    if (!taskStatus) return;

    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task) {
      return;
    }

    // Don't update if task is already in the suggested status
    if (task.status === taskStatus) {
      return;
    }

    // Update task status
    await db
      .update(tasks)
      .set({
        status: taskStatus,
        completedAt: taskStatus === "DONE" ? new Date() : undefined,
      })
      .where(eq(tasks.id, taskId));

    console.log(`Auto-updated task ${taskId} status to ${taskStatus}`);
  }

  /**
   * Handle message attachments
   */
  private async handleAttachment(
    message: proto.IWebMessageInfo,
    taskUpdateId: string,
    taskId?: string,
  ) {
    try {
      const media = await baileysClient.downloadMedia(message);

      // Save attachment metadata
      await db.insert(taskAttachments).values({
        taskUpdateId,
        taskId: taskId!,
        fileName: media.fileName,
        fileType: media.contentType,
        fileSize: media.data.length,
        storageUrl: "", // Could upload to S3/storage here
        mimeType: media.contentType,
        matrixMxcUrl: "", // Not applicable for Baileys
      });

      console.log(
        `Saved attachment: ${media.fileName} (${media.contentType}) for task update ${taskUpdateId}`,
      );
    } catch (error) {
      console.error("Error handling attachment:", error);
    }
  }

  /**
   * Stop listening for messages
   */
  stopListening() {
    this.isListening = false;
    console.log("Message handler stopped listening");
  }
}

// Export singleton instance
export const messageHandler = new MessageHandlerService();
