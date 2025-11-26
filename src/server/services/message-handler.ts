import { matrixClient } from "./matrix-client";
import { db } from "../db";
import type { MatrixEvent, Room } from "matrix-js-sdk";
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
 * Processes incoming WhatsApp messages from Matrix bridge
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

    await matrixClient.initialize();

    matrixClient.onMessage(async (event, room, sender) => {
      try {
        await this.handleMessage(event, room, sender);
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
  private async handleMessage(
    event: MatrixEvent,
    room: Room,
    senderId: string,
  ) {
    const content = event.getContent();
    const messageBody = content.body as string;
    const matrixEventId = event.getId()!;

    // Get conversation by Matrix room ID
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.matrixRoomId, room.roomId))
      .limit(1);

    if (!conversation) {
      console.log(`Ignoring message from untracked room: ${room.roomId}`);
      return;
    }

    // Get sender from assigned users (only track messages from workers, not managers)
    const [assignedUser] = await db
      .select()
      .from(assignedUsers)
      .where(eq(assignedUsers.matrixUserId, senderId))
      .limit(1);

    if (!assignedUser) {
      console.log(`Ignoring message from non-assigned user: ${senderId}`);
      return;
    }

    // Check if message already exists (prevent duplicates)
    const existingUpdate = await db.query.taskUpdates.findFirst({
      where: eq(taskUpdates.matrixEventId, matrixEventId),
    });

    if (existingUpdate) {
      console.log(`Message already processed: ${matrixEventId}`);
      return;
    }

    // Determine message type
    const messageType = this.getMessageType(content);

    // Check if this is a reply to a task assignment
    const replyTo = content["m.relates_to"]?.["m.in_reply_to"]
      ?.event_id as string | undefined;
    let taskId: string | undefined;

    if (replyTo) {
      // Find task by its Matrix event ID
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.matrixEventId, replyTo))
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

    // Analyze message content with AI
    const aiAnalysis = await this.analyzeMessageWithAI(messageBody, taskId);

    // Save task update to database
    const [taskUpdate] = await db
      .insert(taskUpdates)
      .values({
        taskId: taskId!,
        assignedUserId: assignedUser.id,
        whatsappMessageId: matrixEventId,
        matrixEventId,
        messageText: messageBody,
        messageType,
        analyzedByAI: true,
        aiAnalysis,
      })
      .returning();

    // Handle attachments if present
    if (messageType !== "TEXT" && taskUpdate) {
      await this.handleAttachment(event, taskUpdate.id, taskId);
    }

    // Update task status based on AI analysis
    if (taskId && aiAnalysis && aiAnalysis.status) {
      await this.updateTaskBasedOnAnalysis(taskId, aiAnalysis);
    }

    console.log(
      `Processed message: ${matrixEventId} for task: ${taskId ?? "none"}`,
    );
  }

  /**
   * Determine message type from content
   */
  private getMessageType(content: any): MessageType {
    const msgtype = content.msgtype as string;

    if (msgtype === "m.image") return "IMAGE";
    if (msgtype === "m.video") return "VIDEO";
    if (msgtype === "m.audio") return "AUDIO";
    if (msgtype === "m.file") return "DOCUMENT";

    return "TEXT";
  }

  /**
   * Analyze message content using AI to determine intent and task status
   */
  private async analyzeMessageWithAI(
    messageBody: string,
    taskId?: string,
  ): Promise<{
    status?: TaskStatus;
    sentiment?: "positive" | "neutral" | "negative";
    progress?: number;
    summary?: string;
    keywords?: string[];
  }> {
    // Simple keyword-based analysis (replace with actual LLM API call)
    const lowerMessage = messageBody.toLowerCase();

    // Check for completion indicators
    const completionKeywords = ["done", "finished", "completed", "complete", "ready"];
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

    // Determine status
    let status: TaskStatus | undefined;
    let confidence = 0.5;

    if (hasCompletionKeyword && taskId) {
      status = "DONE";
      confidence = 0.9;
    } else if (hasBlockedKeyword && taskId) {
      status = "BLOCKED";
      confidence = 0.85;
    } else if (needsFeedback && taskId) {
      status = "FEEDBACK_NEEDED";
      confidence = 0.8;
    } else if (hasProgressKeyword && taskId) {
      status = "IN_PROGRESS";
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
      status?: TaskStatus;
      confidence?: number;
    },
  ) {
    // Only auto-update if status is provided
    if (!analysis.status) {
      return;
    }

    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task) {
      return;
    }

    // Don't update if task is already in the suggested status
    if (task.status === analysis.status) {
      return;
    }

    // Update task status
    await db
      .update(tasks)
      .set({
        status: analysis.status,
        completedAt: analysis.status === "DONE" ? new Date() : undefined,
      })
      .where(eq(tasks.id, taskId));

    console.log(
      `Auto-updated task ${taskId} status to ${analysis.status}`,
    );
  }

  /**
   * Handle message attachments
   */
  private async handleAttachment(
    event: MatrixEvent,
    taskUpdateId: string,
    taskId?: string,
  ) {
    try {
      const media = await matrixClient.downloadMedia(event);
      const content = event.getContent();

      // Save attachment metadata
      await db.insert(taskAttachments).values({
        taskUpdateId,
        taskId: taskId!,
        fileName: media.fileName,
        fileType: content.msgtype || "m.file",
        fileSize: media.data.byteLength,
        storageUrl: content.url || "",
        mimeType: media.contentType,
        matrixMxcUrl: content.url,
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
