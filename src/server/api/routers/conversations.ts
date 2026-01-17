import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { whatsappBridge } from "~/server/services/whatsapp-bridge";
import { conversations, conversationMembers, tasks } from "~/server/db/schema";
import { eq, and, or, desc, count } from "drizzle-orm";

const ConversationTypeEnum = z.enum(["PERSONAL", "GROUP"]);

export const conversationsRouter = createTRPCRouter({
  /**
   * Create a new WhatsApp conversation (group or personal)
   */
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        managerId: z.string(),
        assignedUserIds: z.array(z.string()),
        type: ConversationTypeEnum.optional().default("GROUP"),
      }),
    )
    .mutation(async ({ input }) => {
      const conversation = await whatsappBridge.createTaskConversation(
        input.name,
        input.managerId,
        input.assignedUserIds,
        input.type,
      );

      return conversation;
    }),

  /**
   * Get all conversations for a manager
   */
  listByManager: publicProcedure
    .input(
      z.object({
        managerId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const conversations = await whatsappBridge.getConversationsForManager(
        input.managerId,
      );

      return conversations;
    }),

  /**
   * Get a specific conversation by ID
   */
  getById: publicProcedure
    .input(
      z.object({
        conversationId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const [conversation] = await ctx.db.query.conversations.findMany({
        where: eq(conversations.id, input.conversationId),
        with: {
          members: {
            with: {
              assignedUser: true,
              manager: true,
            },
          },
          tasks: {
            with: {
              assignedUser: true,
            },
            orderBy: desc(tasks.createdAt),
            limit: 10,
          },
        },
        limit: 1,
      });

      return conversation ?? null;
    }),

  /**
   * Get conversations by WhatsApp JID
   * Note: matrixRoomId field stores WhatsApp JID for Baileys integration
   */
  getByMatrixRoomId: publicProcedure
    .input(
      z.object({
        matrixRoomId: z.string(), // Actually WhatsApp JID (legacy field name)
      }),
    )
    .query(async ({ ctx, input }) => {
      const [conversation] = await ctx.db.query.conversations.findMany({
        where: eq(conversations.matrixRoomId, input.matrixRoomId),
        with: {
          members: {
            with: {
              assignedUser: true,
              manager: true,
            },
          },
        },
        limit: 1,
      });

      return conversation ?? null;
    }),

  /**
   * Add a participant to a conversation
   */
  addParticipant: publicProcedure
    .input(
      z.object({
        conversationId: z.string(),
        assignedUserId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      await whatsappBridge.addParticipant(
        input.conversationId,
        input.assignedUserId,
      );
      return { success: true };
    }),

  /**
   * Get conversation members
   */
  getMembers: publicProcedure
    .input(
      z.object({
        conversationId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const members = await ctx.db.query.conversationMembers.findMany({
        where: eq(conversationMembers.conversationId, input.conversationId),
        with: {
          assignedUser: true,
          manager: true,
        },
      });

      return members;
    }),

  /**
   * Get conversation statistics
   */
  getStats: publicProcedure
    .input(
      z.object({
        conversationId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const [conversation] = await ctx.db.query.conversations.findMany({
        where: eq(conversations.id, input.conversationId),
        with: {
          tasks: true,
          members: true,
        },
        limit: 1,
      });

      if (!conversation) {
        throw new Error("Conversation not found");
      }

      const stats = {
        totalTasks: conversation.tasks.length,
        todoTasks: conversation.tasks.filter((t) => t.status === "TODO").length,
        inProgressTasks: conversation.tasks.filter(
          (t) => t.status === "IN_PROGRESS",
        ).length,
        doneTasks: conversation.tasks.filter((t) => t.status === "DONE").length,
        blockedTasks: conversation.tasks.filter((t) => t.status === "BLOCKED")
          .length,
        totalMembers: conversation.members.length,
        managers: conversation.members.filter((m) => m.managerId !== null)
          .length,
        assignedUsers: conversation.members.filter(
          (m) => m.assignedUserId !== null,
        ).length,
      };

      return stats;
    }),

  /**
   * List all conversations with basic info
   */
  listAll: publicProcedure
    .input(
      z.object({
        type: ConversationTypeEnum.optional(),
        limit: z.number().min(1).max(100).optional().default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const query = input.type
        ? ctx.db.query.conversations.findMany({
            where: eq(conversations.type, input.type),
            with: {
              members: {
                limit: 5,
                with: {
                  assignedUser: true,
                  manager: true,
                },
              },
              tasks: {
                where: or(
                  eq(tasks.status, "TODO"),
                  eq(tasks.status, "IN_PROGRESS"),
                ),
                limit: 3,
              },
            },
            orderBy: desc(conversations.createdAt),
            limit: input.limit,
          })
        : ctx.db.query.conversations.findMany({
            with: {
              members: {
                limit: 5,
                with: {
                  assignedUser: true,
                  manager: true,
                },
              },
              tasks: {
                where: or(
                  eq(tasks.status, "TODO"),
                  eq(tasks.status, "IN_PROGRESS"),
                ),
                limit: 3,
              },
            },
            orderBy: desc(conversations.createdAt),
            limit: input.limit,
          });

      return query;
    }),

  /**
   * Update conversation details
   */
  update: publicProcedure
    .input(
      z.object({
        conversationId: z.string(),
        name: z.string().min(1).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { conversationId, ...updateData } = input;

      if (!updateData.name) {
        throw new Error("At least one field must be provided for update");
      }

      const [conversation] = await ctx.db
        .update(conversations)
        .set({ name: updateData.name })
        .where(eq(conversations.id, conversationId))
        .returning();

      return conversation;
    }),

  /**
   * Remove a participant from a conversation
   */
  removeParticipant: publicProcedure
    .input(
      z.object({
        conversationId: z.string(),
        memberId: z.string(), // conversation member ID
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(conversationMembers)
        .where(eq(conversationMembers.id, input.memberId));

      return { success: true };
    }),
});
