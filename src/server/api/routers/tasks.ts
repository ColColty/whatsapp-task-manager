import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { whatsappBridge } from "~/server/services/whatsapp-bridge";

const TaskStatusEnum = z.enum([
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "BLOCKED",
  "CANCELLED",
]);

const TaskPriorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

export const tasksRouter = createTRPCRouter({
  /**
   * Create a new task
   */
  create: publicProcedure
    .input(
      z.object({
        groupId: z.string(),
        title: z.string().min(1).max(200),
        description: z.string().optional(),
        createdByUserId: z.string(),
        assigneeUserId: z.string().optional(),
        dueDate: z.date().optional(),
        priority: TaskPriorityEnum.optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const task = await whatsappBridge.createTask({
        groupId: input.groupId,
        title: input.title,
        description: input.description,
        createdByUserId: input.createdByUserId,
        assigneeUserId: input.assigneeUserId,
        dueDate: input.dueDate,
        priority: input.priority,
      });

      return task;
    }),

  /**
   * Get tasks for a specific group
   */
  listByGroup: publicProcedure
    .input(
      z.object({
        groupId: z.string(),
        status: TaskStatusEnum.optional(),
      }),
    )
    .query(async ({ input }) => {
      const tasks = await whatsappBridge.getTasksForGroup(input.groupId);

      if (input.status) {
        return tasks.filter((task) => task.status === input.status);
      }

      return tasks;
    }),

  /**
   * Get tasks assigned to a user
   */
  listByUser: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        status: TaskStatusEnum.optional(),
      }),
    )
    .query(async ({ input }) => {
      const tasks = await whatsappBridge.getTasksForUser(input.userId);

      if (input.status) {
        return tasks.filter((task) => task.status === input.status);
      }

      return tasks;
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
      const task = await ctx.db.task.findUnique({
        where: { id: input.taskId },
        include: {
          group: true,
          assignee: true,
          createdBy: true,
          messages: {
            include: {
              sender: true,
              attachments: true,
            },
            orderBy: { createdAt: "asc" },
          },
          attachments: true,
        },
      });

      return task;
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
        assigneeUserId: z.string().optional(),
        dueDate: z.date().optional(),
        priority: TaskPriorityEnum.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { taskId, ...updateData } = input;

      // Get assignee user if provided
      let assigneeId: string | undefined;
      if (input.assigneeUserId) {
        const assignee = await ctx.db.user.findUnique({
          where: { matrixUserId: input.assigneeUserId },
        });
        assigneeId = assignee?.id;
      }

      const task = await ctx.db.task.update({
        where: { id: taskId },
        data: {
          title: updateData.title,
          description: updateData.description,
          assigneeId,
          dueDate: updateData.dueDate,
          priority: updateData.priority,
        },
        include: {
          group: true,
          assignee: true,
          createdBy: true,
        },
      });

      return task;
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
      await ctx.db.task.delete({
        where: { id: input.taskId },
      });

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
        groupId: z.string().optional(),
        userId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();

      const whereClause: any = {
        dueDate: {
          lt: now,
        },
        status: {
          notIn: ["COMPLETED", "CANCELLED"],
        },
      };

      if (input.groupId) {
        whereClause.groupId = input.groupId;
      }

      if (input.userId) {
        const user = await ctx.db.user.findUnique({
          where: { matrixUserId: input.userId },
        });
        if (user) {
          whereClause.assigneeId = user.id;
        }
      }

      const tasks = await ctx.db.task.findMany({
        where: whereClause,
        include: {
          group: true,
          assignee: true,
          createdBy: true,
        },
        orderBy: { dueDate: "asc" },
      });

      return tasks;
    }),
});
