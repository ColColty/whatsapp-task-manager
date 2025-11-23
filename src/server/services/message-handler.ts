import { matrixClient } from "./matrix-client";
import { db } from "../db";
import type { MatrixEvent, Room } from "matrix-js-sdk";

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
  private async handleMessage(event: MatrixEvent, room: Room, senderId: string) {
    const content = event.getContent();
    const messageBody = content.body as string;
    const matrixEventId = event.getId()!;

    // Get or create group in database
    const group = await db.group.findUnique({
      where: { matrixRoomId: room.roomId },
    });

    if (!group) {
      // This room is not tracked in our database, ignore
      console.log(`Ignoring message from untracked room: ${room.roomId}`);
      return;
    }

    // Get or create sender user
    let sender = await db.user.findUnique({
      where: { matrixUserId: senderId },
    });

    if (!sender) {
      sender = await db.user.create({
        data: {
          matrixUserId: senderId,
          displayName: senderId.split(":")[0]?.replace("@", "") ?? senderId,
        },
      });
    }

    // Check if message already exists (prevent duplicates)
    const existingMessage = await db.message.findUnique({
      where: { matrixEventId },
    });

    if (existingMessage) {
      console.log(`Message already processed: ${matrixEventId}`);
      return;
    }

    // Determine message type
    const messageType = this.getMessageType(content);

    // Check if this is a reply to a task assignment
    const replyTo = content["m.relates_to"]?.["m.in_reply_to"]?.event_id as string | undefined;
    let taskId: string | undefined;

    if (replyTo) {
      // Find task by its Matrix event ID
      const task = await db.task.findFirst({
        where: { matrixEventId: replyTo },
      });

      if (task) {
        taskId = task.id;
      }
    }

    // If no task found via reply, try to find task by context
    if (!taskId) {
      // Find any pending/in-progress tasks assigned to this user in this group
      const userTasks = await db.task.findMany({
        where: {
          groupId: group.id,
          assigneeId: sender.id,
          status: {
            in: ["PENDING", "IN_PROGRESS"],
          },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      });

      if (userTasks.length > 0) {
        taskId = userTasks[0]!.id;
      }
    }

    // Analyze message content with AI
    const aiAnalysis = await this.analyzeMessageWithAI(messageBody, taskId);

    // Save message to database
    const message = await db.message.create({
      data: {
        content: messageBody,
        messageType,
        groupId: group.id,
        senderId: sender.id,
        taskId,
        matrixEventId,
        aiAnalysis,
      },
    });

    // Handle attachments if present
    if (messageType !== "TEXT") {
      await this.handleAttachment(event, message.id, taskId);
    }

    // Update task status based on AI analysis
    if (taskId && aiAnalysis) {
      await this.updateTaskBasedOnAnalysis(taskId, aiAnalysis as any);
    }

    console.log(`Processed message: ${matrixEventId} for task: ${taskId ?? "none"}`);
  }

  /**
   * Determine message type from content
   */
  private getMessageType(content: any): "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "AUDIO" {
    const msgtype = content.msgtype as string;

    if (msgtype === "m.image") return "IMAGE";
    if (msgtype === "m.video") return "VIDEO";
    if (msgtype === "m.audio") return "AUDIO";
    if (msgtype === "m.file") return "DOCUMENT";

    return "TEXT";
  }

  /**
   * Analyze message content using AI to determine intent and task status
   * In a real implementation, this would call an LLM API (OpenAI, Anthropic, etc.)
   */
  private async analyzeMessageWithAI(
    messageBody: string,
    taskId?: string,
  ): Promise<{
    intent: "task_update" | "task_complete" | "question" | "general";
    suggestedStatus?: "IN_PROGRESS" | "COMPLETED" | "BLOCKED";
    confidence: number;
    summary: string;
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
      "help",
    ];
    const hasBlockedKeyword = blockedKeywords.some((kw) => lowerMessage.includes(kw));

    // Check for questions
    const hasQuestionMark = messageBody.includes("?");
    const questionWords = ["what", "when", "where", "who", "why", "how"];
    const hasQuestionWord = questionWords.some((qw) => lowerMessage.startsWith(qw));

    // Determine intent and status
    let intent: "task_update" | "task_complete" | "question" | "general" = "general";
    let suggestedStatus: "IN_PROGRESS" | "COMPLETED" | "BLOCKED" | undefined;
    let confidence = 0.5;

    if (hasCompletionKeyword && taskId) {
      intent = "task_complete";
      suggestedStatus = "COMPLETED";
      confidence = 0.9;
    } else if (hasBlockedKeyword && taskId) {
      intent = "task_update";
      suggestedStatus = "BLOCKED";
      confidence = 0.85;
    } else if (hasProgressKeyword && taskId) {
      intent = "task_update";
      suggestedStatus = "IN_PROGRESS";
      confidence = 0.8;
    } else if (hasQuestionMark || hasQuestionWord) {
      intent = "question";
      confidence = 0.7;
    } else if (taskId) {
      intent = "task_update";
      confidence = 0.6;
    }

    return {
      intent,
      suggestedStatus,
      confidence,
      summary: messageBody.substring(0, 100),
    };
  }

  /**
   * Update task status based on AI analysis
   */
  private async updateTaskBasedOnAnalysis(
    taskId: string,
    analysis: {
      intent: string;
      suggestedStatus?: "IN_PROGRESS" | "COMPLETED" | "BLOCKED";
      confidence: number;
    },
  ) {
    // Only auto-update if confidence is high enough
    if (analysis.confidence < 0.7 || !analysis.suggestedStatus) {
      return;
    }

    const task = await db.task.findUnique({
      where: { id: taskId },
      include: { group: true },
    });

    if (!task) {
      return;
    }

    // Don't update if task is already in the suggested status
    if (task.status === analysis.suggestedStatus) {
      return;
    }

    // Update task status
    await db.task.update({
      where: { id: taskId },
      data: {
        status: analysis.suggestedStatus,
        completedAt:
          analysis.suggestedStatus === "COMPLETED" ? new Date() : undefined,
      },
    });

    console.log(
      `Auto-updated task ${taskId} status to ${analysis.suggestedStatus} (confidence: ${analysis.confidence})`,
    );
  }

  /**
   * Handle message attachments
   */
  private async handleAttachment(
    event: MatrixEvent,
    messageId: string,
    taskId?: string,
  ) {
    try {
      const media = await matrixClient.downloadMedia(event);
      const content = event.getContent();

      // In a real implementation, you would save the file to disk or cloud storage
      // For now, we'll just store the metadata and MXC URL

      await db.attachment.create({
        data: {
          fileName: media.fileName,
          mimeType: media.contentType,
          fileSize: media.data.byteLength,
          matrixMxcUrl: content.url,
          messageId,
          taskId,
        },
      });

      console.log(
        `Saved attachment: ${media.fileName} (${media.contentType}) for message ${messageId}`,
      );
    } catch (error) {
      console.error("Error handling attachment:", error);
    }
  }

  /**
   * Stop listening for messages
   */
  stopListening() {
    // Matrix client handles this internally
    this.isListening = false;
    console.log("Message handler stopped listening");
  }
}

// Export singleton instance
export const messageHandler = new MessageHandlerService();
