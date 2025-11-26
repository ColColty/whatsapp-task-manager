import { matrixClient } from "./matrix-client";
import { llmService } from "./llm-service";
import { db } from "../db";
import {
  conversations,
  conversationMembers,
  tasks,
  taskUpdates,
  assignedUsers,
  managers,
  projects,
  reminders,
  type taskStatusEnum,
  type taskPriorityEnum,
  type conversationTypeEnum,
} from "../db/schema";
import { eq, and, or, desc, inArray } from "drizzle-orm";

type TaskStatus = typeof taskStatusEnum.enumValues[number];
type TaskPriority = typeof taskPriorityEnum.enumValues[number];
type ConversationType = typeof conversationTypeEnum.enumValues[number];

/**
 * Message options for task creation
 * - "default": Use the built-in template (fastest, no API call)
 * - "llm": Generate message using LLM (requires OPENAI_API_KEY)
 * - custom string: Use the provided message as-is
 */
export type TaskMessageOption = "default" | "llm" | string;

/**
 * WhatsApp Bridge Service
 * High-level service that combines Matrix operations with database management
 * Adapted to work with existing schema (managers, assigned users, projects, conversations)
 */
export class WhatsAppBridgeService {
  /**
   * Create a new WhatsApp conversation (group or personal) for task management
   */
  async createTaskConversation(
    name: string,
    managerId: string,
    assignedUserIds: string[],
    type: ConversationType = "GROUP",
  ) {
    // Get manager's Matrix user ID
    const [manager] = await db
      .select()
      .from(managers)
      .where(eq(managers.id, managerId))
      .limit(1);

    if (!manager?.matrixUserId) {
      throw new Error("Manager must have a Matrix user ID configured");
    }

    // Get assigned users' Matrix user IDs
    const assignedUsersData = await db
      .select()
      .from(assignedUsers)
      .where(inArray(assignedUsers.id, assignedUserIds));

    const matrixUserIds = assignedUsersData
      .map((u) => u.matrixUserId)
      .filter((id): id is string => id !== null);

    // Create Matrix room with all participants
    const allParticipants = [manager.matrixUserId, ...matrixUserIds];
    const matrixRoomId = await matrixClient.createRoom(name, allParticipants);

    // Convert Matrix room to WhatsApp group using the bridge
    await matrixClient.createWhatsAppGroup(matrixRoomId);

    // Save conversation to database
    const [conversation] = await db
      .insert(conversations)
      .values({
        whatsappConversationId: matrixRoomId,
        matrixRoomId,
        name,
        type,
      })
      .returning();

    // Add conversation members
    const memberInserts = [
      { conversationId: conversation!.id, managerId },
      ...assignedUserIds.map((userId) => ({
        conversationId: conversation!.id,
        assignedUserId: userId,
      })),
    ];

    await db.insert(conversationMembers).values(memberInserts);

    return conversation;
  }

  /**
   * Create and assign a task in a conversation
   * @param params.messageOption - How to generate the WhatsApp message:
   *   - "default": Use built-in template
   *   - "llm": Generate with AI (requires OPENAI_API_KEY)
   *   - Any other string: Use as custom message
   */
  async createTask(params: {
    projectId: string;
    conversationId: string;
    title: string;
    description?: string;
    managerId: string;
    assignedUserId: string;
    dueDate?: Date;
    priority?: TaskPriority;
    messageOption?: TaskMessageOption;
  }) {
    const {
      projectId,
      conversationId,
      title,
      description,
      managerId,
      assignedUserId,
      dueDate,
      priority = "MEDIUM",
      messageOption = "default",
    } = params;

    // Get conversation
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!conversation) {
      throw new Error("Conversation not found");
    }

    // Get assigned user
    const [assignedUser] = await db
      .select()
      .from(assignedUsers)
      .where(eq(assignedUsers.id, assignedUserId))
      .limit(1);

    if (!assignedUser) {
      throw new Error("Assigned user not found");
    }

    // Get project name for LLM context
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    // Determine the message to send
    let customMessage: string | undefined;

    if (messageOption === "llm") {
      // Generate message using LLM
      const generated = await llmService.generateTaskMessage({
        title,
        description,
        assigneeName: assignedUser.name,
        dueDate,
        priority,
        projectName: project?.name,
      });
      customMessage = generated.message;
    } else if (messageOption !== "default") {
      // Use the provided custom message
      customMessage = messageOption;
    }
    // If messageOption === "default", customMessage stays undefined and default template is used

    // Create task in database
    const [task] = await db
      .insert(tasks)
      .values({
        projectId,
        conversationId,
        assignedUserId,
        managerId,
        title,
        description,
        dueDate,
        priority,
        status: "TODO",
      })
      .returning();

    // Send task assignment message to WhatsApp group
    if (conversation.matrixRoomId) {
      const matrixEventId = await matrixClient.sendTaskAssignment(
        conversation.matrixRoomId,
        title,
        description ?? "",
        assignedUser.name,
        customMessage,
      );

      // Update task with Matrix event ID
      await db
        .update(tasks)
        .set({ matrixEventId })
        .where(eq(tasks.id, task!.id));
    }

    return task;
  }

  /**
   * Generate a preview of the task message without creating the task
   * Useful for letting users see what message will be sent before confirming
   */
  async generateTaskMessagePreview(params: {
    projectId: string;
    title: string;
    description?: string;
    assignedUserId: string;
    dueDate?: Date;
    priority?: TaskPriority;
    messageOption?: TaskMessageOption;
  }): Promise<{ message: string; wasGenerated: boolean }> {
    const {
      projectId,
      title,
      description,
      assignedUserId,
      dueDate,
      priority,
      messageOption = "llm",
    } = params;

    // Get assigned user
    const [assignedUser] = await db
      .select()
      .from(assignedUsers)
      .where(eq(assignedUsers.id, assignedUserId))
      .limit(1);

    // Get project name
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (messageOption === "default") {
      // Return the default template
      const message = assignedUser?.name
        ? `📋 New Task: ${title}\n\n${description ?? ""}\n\n👤 Assigned to: ${assignedUser.name}\n\nReply to this message with updates or attach photos/videos of your progress!`
        : `📋 New Task: ${title}\n\n${description ?? ""}\n\nReply to this message with updates or attach photos/videos of your progress!`;

      return { message, wasGenerated: false };
    }

    if (messageOption === "llm") {
      // Generate using LLM
      return llmService.generateTaskMessage({
        title,
        description,
        assigneeName: assignedUser?.name,
        dueDate,
        priority,
        projectName: project?.name,
      });
    }

    // Custom message provided
    return { message: messageOption, wasGenerated: false };
  }

  /**
   * Update task status
   */
  async updateTaskStatus(taskId: string, status: TaskStatus) {
    const [task] = await db
      .update(tasks)
      .set({
        status,
        completedAt: status === "DONE" ? new Date() : undefined,
      })
      .where(eq(tasks.id, taskId))
      .returning();

    if (!task) {
      throw new Error("Task not found");
    }

    // Get conversation for sending status update
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, task.conversationId))
      .limit(1);

    if (conversation?.matrixRoomId) {
      const statusEmoji = this.getStatusEmoji(status);
      const message = `${statusEmoji} Task status updated: "${task.title}" is now ${status}`;
      await matrixClient.sendMessage(conversation.matrixRoomId, message);
    }

    return task;
  }

  /**
   * Get all tasks for a conversation
   */
  async getTasksForConversation(conversationId: string) {
    return db.query.tasks.findMany({
      where: eq(tasks.conversationId, conversationId),
      with: {
        assignedUser: true,
        manager: true,
        conversation: true,
        updates: {
          limit: 5,
          orderBy: desc(taskUpdates.createdAt),
          with: {
            assignedUser: true,
            attachments: true,
          },
        },
        attachments: true,
      },
      orderBy: desc(tasks.createdAt),
    });
  }

  /**
   * Get all tasks assigned to a user
   */
  async getTasksForUser(assignedUserId: string) {
    return db.query.tasks.findMany({
      where: eq(tasks.assignedUserId, assignedUserId),
      with: {
        conversation: true,
        manager: true,
        project: true,
        updates: {
          limit: 5,
          orderBy: desc(taskUpdates.createdAt),
          with: {
            assignedUser: true,
            attachments: true,
          },
        },
      },
      orderBy: desc(tasks.createdAt),
    });
  }

  /**
   * Send a reminder for a task
   */
  async sendTaskReminder(taskId: string) {
    const [task] = await db.query.tasks.findMany({
      where: eq(tasks.id, taskId),
      with: {
        assignedUser: true,
        conversation: true,
      },
      limit: 1,
    });

    if (!task) {
      throw new Error("Task not found");
    }

    const message = `⏰ Reminder: ${task.assignedUser.name}, don't forget about the task "${task.title}"!\n\nPlease provide an update when you can.`;

    if (task.conversation.matrixRoomId) {
      await matrixClient.sendMessage(task.conversation.matrixRoomId, message);
    }

    // Log reminder in database
    await db.insert(reminders).values({
      taskId,
      conversationId: task.conversationId,
      frequency: "ONCE",
      lastSentAt: new Date(),
    });
  }

  /**
   * Get status emoji for task status
   */
  private getStatusEmoji(status: TaskStatus): string {
    const emojiMap: Record<TaskStatus, string> = {
      TODO: "⏳",
      IN_PROGRESS: "🔄",
      DONE: "✅",
      BLOCKED: "🚫",
      FEEDBACK_NEEDED: "💬",
    };
    return emojiMap[status] || "📋";
  }

  /**
   * Get all conversations for a manager
   */
  async getConversationsForManager(managerId: string) {
    const managerConversations = await db.query.conversationMembers.findMany({
      where: eq(conversationMembers.managerId, managerId),
      with: {
        conversation: {
          with: {
            tasks: {
              where: or(
                eq(tasks.status, "TODO"),
                eq(tasks.status, "IN_PROGRESS"),
              ),
              limit: 5,
            },
          },
        },
      },
    });

    return managerConversations.map((mc) => mc.conversation);
  }

  /**
   * Add a participant to a conversation
   */
  async addParticipant(conversationId: string, assignedUserId: string) {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const [assignedUser] = await db
      .select()
      .from(assignedUsers)
      .where(eq(assignedUsers.id, assignedUserId))
      .limit(1);

    if (!assignedUser?.matrixUserId) {
      throw new Error("Assigned user must have a Matrix user ID");
    }

    // Add to conversation members
    await db.insert(conversationMembers).values({
      conversationId,
      assignedUserId,
    });

    // Invite user to Matrix room (which will sync to WhatsApp)
    if (conversation.matrixRoomId) {
      await matrixClient.inviteUser(
        conversation.matrixRoomId,
        assignedUser.matrixUserId,
      );
    }

    return true;
  }
}

// Export singleton instance
export const whatsappBridge = new WhatsAppBridgeService();
