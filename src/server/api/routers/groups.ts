import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { whatsappBridge } from "~/server/services/whatsapp-bridge";

export const groupsRouter = createTRPCRouter({
  /**
   * Create a new WhatsApp group for task management
   */
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        managerUserId: z.string(),
        memberUserIds: z.array(z.string()),
      }),
    )
    .mutation(async ({ input }) => {
      const group = await whatsappBridge.createTaskGroup(
        input.name,
        input.managerUserId,
        input.memberUserIds,
        input.description,
      );

      return group;
    }),

  /**
   * Get all groups for a user
   */
  list: publicProcedure
    .input(
      z.object({
        userId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const groups = await whatsappBridge.getGroupsForUser(input.userId);
      return groups;
    }),

  /**
   * Get a specific group by ID
   */
  getById: publicProcedure
    .input(
      z.object({
        groupId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const group = await ctx.db.group.findUnique({
        where: { id: input.groupId },
        include: {
          tasks: {
            include: {
              assignee: true,
              createdBy: true,
            },
            orderBy: { createdAt: "desc" },
            take: 20,
          },
          _count: {
            select: {
              tasks: true,
              messages: true,
            },
          },
        },
      });

      return group;
    }),

  /**
   * Add a participant to a group
   */
  addParticipant: publicProcedure
    .input(
      z.object({
        groupId: z.string(),
        matrixUserId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      await whatsappBridge.addParticipant(input.groupId, input.matrixUserId);
      return { success: true };
    }),

  /**
   * Get group statistics
   */
  getStats: publicProcedure
    .input(
      z.object({
        groupId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const [
        totalTasks,
        pendingTasks,
        inProgressTasks,
        completedTasks,
        blockedTasks,
        totalMessages,
      ] = await Promise.all([
        ctx.db.task.count({ where: { groupId: input.groupId } }),
        ctx.db.task.count({
          where: { groupId: input.groupId, status: "PENDING" },
        }),
        ctx.db.task.count({
          where: { groupId: input.groupId, status: "IN_PROGRESS" },
        }),
        ctx.db.task.count({
          where: { groupId: input.groupId, status: "COMPLETED" },
        }),
        ctx.db.task.count({
          where: { groupId: input.groupId, status: "BLOCKED" },
        }),
        ctx.db.message.count({ where: { groupId: input.groupId } }),
      ]);

      return {
        totalTasks,
        pendingTasks,
        inProgressTasks,
        completedTasks,
        blockedTasks,
        totalMessages,
      };
    }),
});
