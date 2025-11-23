import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const attachmentsRouter = createTRPCRouter({
  /**
   * Get attachments for a task
   */
  listByTask: publicProcedure
    .input(
      z.object({
        taskId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const attachments = await ctx.db.attachment.findMany({
        where: { taskId: input.taskId },
        include: {
          message: {
            include: {
              sender: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return attachments;
    }),

  /**
   * Get attachments for a message
   */
  listByMessage: publicProcedure
    .input(
      z.object({
        messageId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const attachments = await ctx.db.attachment.findMany({
        where: { messageId: input.messageId },
        orderBy: { createdAt: "desc" },
      });

      return attachments;
    }),

  /**
   * Get attachment by ID
   */
  getById: publicProcedure
    .input(
      z.object({
        attachmentId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const attachment = await ctx.db.attachment.findUnique({
        where: { id: input.attachmentId },
        include: {
          message: {
            include: {
              sender: true,
              group: true,
            },
          },
          task: true,
        },
      });

      return attachment;
    }),

  /**
   * Get all attachments for a group
   */
  listByGroup: publicProcedure
    .input(
      z.object({
        groupId: z.string(),
        mimeType: z.string().optional(), // Filter by MIME type (e.g., "image/", "video/")
      }),
    )
    .query(async ({ ctx, input }) => {
      const whereClause: any = {
        message: {
          groupId: input.groupId,
        },
      };

      if (input.mimeType) {
        whereClause.mimeType = {
          startsWith: input.mimeType,
        };
      }

      const attachments = await ctx.db.attachment.findMany({
        where: whereClause,
        include: {
          message: {
            include: {
              sender: true,
            },
          },
          task: true,
        },
        orderBy: { createdAt: "desc" },
      });

      return attachments;
    }),

  /**
   * Get attachment statistics
   */
  getStats: publicProcedure
    .input(
      z.object({
        groupId: z.string().optional(),
        taskId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const whereClause: any = {};

      if (input.groupId) {
        whereClause.message = {
          groupId: input.groupId,
        };
      }

      if (input.taskId) {
        whereClause.taskId = input.taskId;
      }

      const [totalAttachments, images, videos, documents, audio] =
        await Promise.all([
          ctx.db.attachment.count({ where: whereClause }),
          ctx.db.attachment.count({
            where: {
              ...whereClause,
              mimeType: { startsWith: "image/" },
            },
          }),
          ctx.db.attachment.count({
            where: {
              ...whereClause,
              mimeType: { startsWith: "video/" },
            },
          }),
          ctx.db.attachment.count({
            where: {
              ...whereClause,
              mimeType: { startsWith: "application/" },
            },
          }),
          ctx.db.attachment.count({
            where: {
              ...whereClause,
              mimeType: { startsWith: "audio/" },
            },
          }),
        ]);

      return {
        totalAttachments,
        images,
        videos,
        documents,
        audio,
      };
    }),

  /**
   * Delete an attachment
   */
  delete: publicProcedure
    .input(
      z.object({
        attachmentId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // TODO: Also delete the actual file from storage
      await ctx.db.attachment.delete({
        where: { id: input.attachmentId },
      });

      return { success: true };
    }),
});
