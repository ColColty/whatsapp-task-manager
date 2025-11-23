import { postRouter } from "~/server/api/routers/post";
import { groupsRouter } from "~/server/api/routers/groups";
import { tasksRouter } from "~/server/api/routers/tasks";
import { messagesRouter } from "~/server/api/routers/messages";
import { attachmentsRouter } from "~/server/api/routers/attachments";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  post: postRouter,
  groups: groupsRouter,
  tasks: tasksRouter,
  messages: messagesRouter,
  attachments: attachmentsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
