import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { whatsappBridge } from "~/server/services/whatsapp-bridge";

export const messagesRouter = createTRPCRouter({
  /**
   * Send a message to a group
   */
  send: publicProcedure
    .input(
      z.object({
        groupId: z.string(),
        content: z.string().min(1),
        senderId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const message = await whatsappBridge.sendMessageToGroup(
        input.groupId,
        input.content,
        input.senderId,
      );

      return message;
    }),

  /**
   * Get messages for a group
   */
  listByGroup: publicProcedure
    .input(
      z.object({
        groupId: z.string(),
        limit: z.number().min(1).max(100).optional().default(50),
        offset: z.number().min(0).optional().default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const messages = await ctx.db.message.findMany({
        where: { groupId: input.groupId },
        include: {
          sender: true,
          task: true,
          attachments: true,
          replyTo: {
            include: {
              sender: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        skip: input.offset,
      });

      return messages;
    }),

  /**
   * Get messages for a specific task
   */
  listByTask: publicProcedure
    .input(
      z.object({
        taskId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const messages = await ctx.db.message.findMany({
        where: { taskId: input.taskId },
        include: {
          sender: true,
          attachments: true,
          replyTo: {
            include: {
              sender: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      return messages;
    }),

  /**
   * Get a specific message by ID
   */
  getById: publicProcedure
    .input(
      z.object({
        messageId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const message = await ctx.db.message.findUnique({
        where: { id: input.messageId },
        include: {
          sender: true,
          group: true,
          task: true,
          attachments: true,
          replyTo: {
            include: {
              sender: true,
            },
          },
          replies: {
            include: {
              sender: true,
            },
          },
        },
      });

      return message;
    }),

  /**
   * Search messages
   */
  search: publicProcedure
    .input(
      z.object({
        query: z.string().min(1),
        groupId: z.string().optional(),
        taskId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const whereClause: any = {
        content: {
          contains: input.query,
        },
      };

      if (input.groupId) {
        whereClause.groupId = input.groupId;
      }

      if (input.taskId) {
        whereClause.taskId = input.taskId;
      }

      const messages = await ctx.db.message.findMany({
        where: whereClause,
        include: {
          sender: true,
          group: true,
          task: true,
          attachments: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      return messages;
    }),

  /**
   * Get message statistics for a group
   */
  getStats: publicProcedure
    .input(
      z.object({
        groupId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const [
        totalMessages,
        textMessages,
        imageMessages,
        videoMessages,
        documentMessages,
      ] = await Promise.all([
        ctx.db.message.count({ where: { groupId: input.groupId } }),
        ctx.db.message.count({
          where: { groupId: input.groupId, messageType: "TEXT" },
        }),
        ctx.db.message.count({
          where: { groupId: input.groupId, messageType: "IMAGE" },
        }),
        ctx.db.message.count({
          where: { groupId: input.groupId, messageType: "VIDEO" },
        }),
        ctx.db.message.count({
          where: { groupId: input.groupId, messageType: "DOCUMENT" },
        }),
      ]);

      return {
        totalMessages,
        textMessages,
        imageMessages,
        videoMessages,
        documentMessages,
      };
    }),
});
