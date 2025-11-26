import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { whatsappBridge } from "~/server/services/whatsapp-bridge";
import { tasks, assignedUsers } from "~/server/db/schema";
import { eq, and, or, lt, notInArray, asc, desc } from "drizzle-orm";

// Match the database schema enums
const TaskStatusEnum = z.enum([
  "TODO",
  "IN_PROGRESS",
  "DONE",
  "BLOCKED",
  "FEEDBACK_NEEDED",
]);

const TaskPriorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

export const tasksRouter = createTRPCRouter({
  /**
   * Create a new task
   */
  create: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        conversationId: z.string(),
        title: z.string().min(1).max(200),
        description: z.string().optional(),
        managerId: z.string(),
        assignedUserId: z.string(),
        dueDate: z.date().optional(),
        priority: TaskPriorityEnum.optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const task = await whatsappBridge.createTask({
        projectId: input.projectId,
        conversationId: input.conversationId,
        title: input.title,
        description: input.description,
        managerId: input.managerId,
        assignedUserId: input.assignedUserId,
        dueDate: input.dueDate,
        priority: input.priority,
      });

      return task;
    }),

  /**
   * Get tasks for a specific conversation
   */
  listByConversation: publicProcedure
    .input(
      z.object({
        conversationId: z.string(),
        status: TaskStatusEnum.optional(),
      }),
    )
    .query(async ({ input }) => {
      const allTasks = await whatsappBridge.getTasksForConversation(
        input.conversationId,
      );

      if (input.status) {
        return allTasks.filter((task) => task.status === input.status);
      }

      return allTasks;
    }),

  /**
   * Get tasks assigned to a user
   */
  listByUser: publicProcedure
    .input(
      z.object({
        assignedUserId: z.string(),
        status: TaskStatusEnum.optional(),
      }),
    )
    .query(async ({ input }) => {
      const allTasks = await whatsappBridge.getTasksForUser(
        input.assignedUserId,
      );

      if (input.status) {
        return allTasks.filter((task) => task.status === input.status);
      }

      return allTasks;
    }),

  /**
   * Get tasks for a project
   */
  listByProject: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        status: TaskStatusEnum.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const query = input.status
        ? ctx.db.query.tasks.findMany({
            where: and(
              eq(tasks.projectId, input.projectId),
              eq(tasks.status, input.status),
            ),
            with: {
              assignedUser: true,
              manager: true,
              conversation: true,
              updates: {
                limit: 3,
                orderBy: desc(tasks.createdAt),
              },
            },
            orderBy: desc(tasks.createdAt),
          })
        : ctx.db.query.tasks.findMany({
            where: eq(tasks.projectId, input.projectId),
            with: {
              assignedUser: true,
              manager: true,
              conversation: true,
              updates: {
                limit: 3,
                orderBy: desc(tasks.createdAt),
              },
            },
            orderBy: desc(tasks.createdAt),
          });

      return query;
    }),

  /**
   * Get a specific task by ID
   */
  getById: publicProcedure
    .input(
      z.object({
        taskId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const [task] = await ctx.db.query.tasks.findMany({
        where: eq(tasks.id, input.taskId),
        with: {
          assignedUser: true,
          manager: true,
          conversation: true,
          project: true,
          updates: {
            with: {
              assignedUser: true,
              attachments: true,
            },
            orderBy: asc(tasks.createdAt),
          },
          attachments: true,
          reminders: true,
        },
        limit: 1,
      });

      return task ?? null;
    }),

  /**
   * Update task status
   */
  updateStatus: publicProcedure
    .input(
      z.object({
        taskId: z.string(),
        status: TaskStatusEnum,
      }),
    )
    .mutation(async ({ input }) => {
      const task = await whatsappBridge.updateTaskStatus(
        input.taskId,
        input.status,
      );

      return task;
    }),

  /**
   * Update task details
   */
  update: publicProcedure
    .input(
      z.object({
        taskId: z.string(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().optional(),
        assignedUserId: z.string().optional(),
        dueDate: z.date().optional(),
        priority: TaskPriorityEnum.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { taskId, ...updateData } = input;

      // Build update object with only provided fields
      const updates: any = {};
      if (updateData.title !== undefined) updates.title = updateData.title;
      if (updateData.description !== undefined)
        updates.description = updateData.description;
      if (updateData.assignedUserId !== undefined)
        updates.assignedUserId = updateData.assignedUserId;
      if (updateData.dueDate !== undefined) updates.dueDate = updateData.dueDate;
      if (updateData.priority !== undefined)
        updates.priority = updateData.priority;

      const [task] = await ctx.db
        .update(tasks)
        .set(updates)
        .where(eq(tasks.id, taskId))
        .returning();

      // Fetch full task with relations
      const [fullTask] = await ctx.db.query.tasks.findMany({
        where: eq(tasks.id, taskId),
        with: {
          assignedUser: true,
          manager: true,
          conversation: true,
          project: true,
        },
        limit: 1,
      });

      return fullTask ?? task;
    }),

  /**
   * Delete a task
   */
  delete: publicProcedure
    .input(
      z.object({
        taskId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(tasks).where(eq(tasks.id, input.taskId));

      return { success: true };
    }),

  /**
   * Send a reminder for a task
   */
  sendReminder: publicProcedure
    .input(
      z.object({
        taskId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      await whatsappBridge.sendTaskReminder(input.taskId);
      return { success: true };
    }),

  /**
   * Get overdue tasks
   */
  getOverdue: publicProcedure
    .input(
      z.object({
        conversationId: z.string().optional(),
        assignedUserId: z.string().optional(),
        projectId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();

      // Build where conditions
      const conditions = [
        lt(tasks.dueDate, now),
        or(eq(tasks.status, "TODO"), eq(tasks.status, "IN_PROGRESS")),
      ];

      if (input.conversationId) {
        conditions.push(eq(tasks.conversationId, input.conversationId));
      }

      if (input.assignedUserId) {
        conditions.push(eq(tasks.assignedUserId, input.assignedUserId));
      }

      if (input.projectId) {
        conditions.push(eq(tasks.projectId, input.projectId));
      }

      const overdueTasks = await ctx.db.query.tasks.findMany({
        where: and(...conditions),
        with: {
          assignedUser: true,
          manager: true,
          conversation: true,
          project: true,
        },
        orderBy: asc(tasks.dueDate),
      });

      return overdueTasks;
    }),

  /**
   * Get task statistics for a project or conversation
   */
  getStats: publicProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        conversationId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!input.projectId && !input.conversationId) {
        throw new Error("Either projectId or conversationId must be provided");
      }

      const whereCondition = input.projectId
        ? eq(tasks.projectId, input.projectId)
        : eq(tasks.conversationId, input.conversationId!);

      const allTasks = await ctx.db.query.tasks.findMany({
        where: whereCondition,
      });

      const stats = {
        total: allTasks.length,
        todo: allTasks.filter((t) => t.status === "TODO").length,
        inProgress: allTasks.filter((t) => t.status === "IN_PROGRESS").length,
        done: allTasks.filter((t) => t.status === "DONE").length,
        blocked: allTasks.filter((t) => t.status === "BLOCKED").length,
        feedbackNeeded: allTasks.filter((t) => t.status === "FEEDBACK_NEEDED")
          .length,
        overdue: allTasks.filter(
          (t) =>
            t.dueDate &&
            t.dueDate < new Date() &&
            t.status !== "DONE",
        ).length,
      };

      return stats;
    }),
});
