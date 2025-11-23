import { matrixClient } from "./matrix-client";
import { db } from "../db";
import type { Task, TaskStatus, TaskPriority, User } from "@prisma/client";

/**
 * WhatsApp Bridge Service
 * High-level service that combines Matrix operations with database management
 */
export class WhatsAppBridgeService {
  /**
   * Create a new WhatsApp group for task management
   * @param name - Group name
   * @param managerUserId - Matrix user ID of the manager creating the group
   * @param memberUserIds - Array of Matrix user IDs to add to the group
   * @returns Group database record
   */
  async createTaskGroup(
    name: string,
    managerUserId: string,
    memberUserIds: string[],
    description?: string,
  ) {
    // Ensure manager user exists in database
    await this.ensureUserExists(managerUserId);

    // Ensure all member users exist in database
    for (const userId of memberUserIds) {
      await this.ensureUserExists(userId);
    }

    // Create Matrix room with all participants
    const allParticipants = [...new Set([managerUserId, ...memberUserIds])];
    const matrixRoomId = await matrixClient.createRoom(name, allParticipants);

    // Convert Matrix room to WhatsApp group using the bridge
    await matrixClient.createWhatsAppGroup(matrixRoomId);

    // Save group to database
    const group = await db.group.create({
      data: {
        matrixRoomId,
        name,
        description,
      },
    });

    return group;
  }

  /**
   * Create and assign a task in a group
   * @param groupId - Database group ID
   * @param title - Task title
   * @param description - Task description
   * @param createdByUserId - Matrix user ID of the creator
   * @param assigneeUserId - Optional Matrix user ID of the assignee
   * @param dueDate - Optional due date
   * @param priority - Task priority
   */
  async createTask(params: {
    groupId: string;
    title: string;
    description?: string;
    createdByUserId: string;
    assigneeUserId?: string;
    dueDate?: Date;
    priority?: TaskPriority;
  }) {
    const {
      groupId,
      title,
      description,
      createdByUserId,
      assigneeUserId,
      dueDate,
      priority = "MEDIUM",
    } = params;

    // Get group from database
    const group = await db.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      throw new Error("Group not found");
    }

    // Ensure users exist
    const createdBy = await this.ensureUserExists(createdByUserId);
    let assignee: User | undefined;
    if (assigneeUserId) {
      assignee = await this.ensureUserExists(assigneeUserId);
    }

    // Create task in database
    const task = await db.task.create({
      data: {
        title,
        description,
        groupId,
        createdById: createdBy.id,
        assigneeId: assignee?.id,
        dueDate,
        priority,
        status: "PENDING",
      },
    });

    // Send task assignment message to WhatsApp group
    const matrixEventId = await matrixClient.sendTaskAssignment(
      group.matrixRoomId,
      title,
      description ?? "",
      assignee?.displayName ?? assignee?.matrixUserId,
    );

    // Update task with Matrix event ID
    await db.task.update({
      where: { id: task.id },
      data: { matrixEventId },
    });

    return task;
  }

  /**
   * Update task status
   * @param taskId - Database task ID
   * @param status - New status
   */
  async updateTaskStatus(taskId: string, status: TaskStatus) {
    const task = await db.task.update({
      where: { id: taskId },
      data: {
        status,
        completedAt: status === "COMPLETED" ? new Date() : undefined,
      },
      include: {
        group: true,
        assignee: true,
      },
    });

    // Send status update to WhatsApp group
    const statusEmoji = this.getStatusEmoji(status);
    const message = `${statusEmoji} Task status updated: "${task.title}" is now ${status}`;

    await matrixClient.sendMessage(task.group.matrixRoomId, message);

    return task;
  }

  /**
   * Get all tasks for a group
   */
  async getTasksForGroup(groupId: string) {
    return db.task.findMany({
      where: { groupId },
      include: {
        assignee: true,
        createdBy: true,
        messages: {
          include: {
            sender: true,
            attachments: true,
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        attachments: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Get all tasks assigned to a user
   */
  async getTasksForUser(userId: string) {
    const user = await db.user.findUnique({
      where: { matrixUserId: userId },
    });

    if (!user) {
      return [];
    }

    return db.task.findMany({
      where: { assigneeId: user.id },
      include: {
        group: true,
        createdBy: true,
        messages: {
          include: {
            sender: true,
            attachments: true,
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Send a reminder for a task
   */
  async sendTaskReminder(taskId: string) {
    const task = await db.task.findUnique({
      where: { id: taskId },
      include: {
        group: true,
        assignee: true,
      },
    });

    if (!task) {
      throw new Error("Task not found");
    }

    const assigneeName = task.assignee?.displayName ?? task.assignee?.matrixUserId ?? "someone";
    const message = `⏰ Reminder: ${assigneeName}, don't forget about the task "${task.title}"!\n\nPlease provide an update when you can.`;

    await matrixClient.sendMessage(task.group.matrixRoomId, message);

    // Log reminder in database
    await db.reminder.create({
      data: {
        taskId,
        scheduledFor: new Date(),
        sent: true,
        sentAt: new Date(),
      },
    });
  }

  /**
   * Send a message to a group
   */
  async sendMessageToGroup(groupId: string, content: string, senderId: string) {
    const group = await db.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      throw new Error("Group not found");
    }

    const sender = await this.ensureUserExists(senderId);

    // Send message via Matrix
    const matrixEventId = await matrixClient.sendMessage(
      group.matrixRoomId,
      content,
    );

    // Save message to database
    const message = await db.message.create({
      data: {
        content,
        groupId,
        senderId: sender.id,
        matrixEventId,
        messageType: "TEXT",
      },
    });

    return message;
  }

  /**
   * Ensure a user exists in the database, create if not
   */
  private async ensureUserExists(matrixUserId: string) {
    let user = await db.user.findUnique({
      where: { matrixUserId },
    });

    if (!user) {
      user = await db.user.create({
        data: {
          matrixUserId,
          displayName: matrixUserId.split(":")[0]?.replace("@", "") ?? matrixUserId,
        },
      });
    }

    return user;
  }

  /**
   * Get status emoji for task status
   */
  private getStatusEmoji(status: TaskStatus): string {
    const emojiMap: Record<TaskStatus, string> = {
      PENDING: "⏳",
      IN_PROGRESS: "🔄",
      COMPLETED: "✅",
      BLOCKED: "🚫",
      CANCELLED: "❌",
    };
    return emojiMap[status] || "📋";
  }

  /**
   * Get all groups for a user
   */
  async getGroupsForUser(userId: string) {
    // Get all rooms where the user is a member via Matrix
    await matrixClient.initialize();
    const client = matrixClient.getClient();
    const rooms = client.getRooms();

    // Filter rooms that exist in our database
    const groups = await db.group.findMany({
      where: {
        matrixRoomId: {
          in: rooms.map((r) => r.roomId),
        },
      },
      include: {
        tasks: {
          where: {
            status: {
              in: ["PENDING", "IN_PROGRESS"],
            },
          },
          take: 5,
        },
        _count: {
          select: {
            tasks: true,
            messages: true,
          },
        },
      },
    });

    return groups;
  }

  /**
   * Add a participant to a group
   */
  async addParticipant(groupId: string, matrixUserId: string) {
    const group = await db.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      throw new Error("Group not found");
    }

    // Ensure user exists in database
    await this.ensureUserExists(matrixUserId);

    // Invite user to Matrix room (which will sync to WhatsApp)
    await matrixClient.inviteUser(group.matrixRoomId, matrixUserId);

    return true;
  }
}

// Export singleton instance
export const whatsappBridge = new WhatsAppBridgeService();
