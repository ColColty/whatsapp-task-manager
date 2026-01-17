import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  json,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

// ============================================================================
// ENUMS
// ============================================================================

export const conversationTypeEnum = pgEnum("conversation_type", [
  "PERSONAL",
  "GROUP",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "TODO",
  "IN_PROGRESS",
  "DONE",
  "BLOCKED",
  "FEEDBACK_NEEDED",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
]);

export const messageTypeEnum = pgEnum("message_type", [
  "TEXT",
  "IMAGE",
  "VIDEO",
  "AUDIO",
  "DOCUMENT",
]);

export const reminderFrequencyEnum = pgEnum("reminder_frequency", [
  "ONCE",
  "DAILY",
  "WEEKLY",
  "CUSTOM",
]);

// ============================================================================
// TABLES
// ============================================================================

/**
 * Manager - Users with Clerk authentication who manage everything
 */
export const managers = pgTable(
  "managers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    clerkId: text("clerk_id").notNull().unique(),
    email: text("email").notNull().unique(),
    name: text("name"),
    phoneNumber: text("phone_number"),
    // WhatsApp integration field (legacy name: matrixUserId)
    // For Baileys: Not needed, we use phoneNumber directly
    matrixUserId: text("matrix_user_id").unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    clerkIdIdx: index("managers_clerk_id_idx").on(table.clerkId),
    matrixUserIdIdx: index("managers_matrix_user_id_idx").on(table.matrixUserId),
  }),
);

/**
 * Project - Work projects (garden, builds, etc.)
 */
export const projects = pgTable(
  "projects",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    managerId: text("manager_id")
      .notNull()
      .references(() => managers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    managerIdIdx: index("projects_manager_id_idx").on(table.managerId),
  }),
);

/**
 * AssignedUser - Workers created by managers, linked to projects, no Clerk account
 */
export const assignedUsers = pgTable(
  "assigned_users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    managerId: text("manager_id")
      .notNull()
      .references(() => managers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phoneNumber: text("phone_number").notNull(), // Used for WhatsApp integration via Baileys
    // WhatsApp integration field (legacy name: matrixUserId)
    // For Baileys: Not needed, we use phoneNumber directly
    matrixUserId: text("matrix_user_id").unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    projectIdIdx: index("assigned_users_project_id_idx").on(table.projectId),
    managerIdIdx: index("assigned_users_manager_id_idx").on(table.managerId),
    matrixUserIdIdx: index("assigned_users_matrix_user_id_idx").on(table.matrixUserId),
    // Unique constraint: each phone number is unique per project
    projectPhoneIdx: uniqueIndex("assigned_users_project_phone_idx").on(
      table.projectId,
      table.phoneNumber,
    ),
  }),
);

/**
 * Conversation - WhatsApp groups or personal chats
 */
export const conversations = pgTable(
  "conversations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    whatsappConversationId: text("whatsapp_conversation_id")
      .notNull()
      .unique(),
    // WhatsApp integration field (legacy name: matrixRoomId)
    // For Baileys: Stores WhatsApp group JID (e.g., "120363123456789@g.us")
    matrixRoomId: text("matrix_room_id").unique(),
    name: text("name"),
    type: conversationTypeEnum("type").notNull().default("PERSONAL"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    whatsappIdIdx: index("conversations_whatsapp_id_idx").on(
      table.whatsappConversationId,
    ),
    matrixRoomIdIdx: index("conversations_matrix_room_id_idx").on(
      table.matrixRoomId,
    ),
  }),
);

/**
 * ConversationMember - Join table for who's in which conversation
 */
export const conversationMembers = pgTable(
  "conversation_members",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    assignedUserId: text("assigned_user_id").references(() => assignedUsers.id, {
      onDelete: "cascade",
    }),
    managerId: text("manager_id").references(() => managers.id, {
      onDelete: "cascade",
    }),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
  },
  (table) => ({
    conversationIdIdx: index("conversation_members_conversation_id_idx").on(
      table.conversationId,
    ),
    // Unique constraints to prevent duplicate memberships
    conversationAssignedUserIdx: uniqueIndex(
      "conversation_members_conversation_assigned_user_idx",
    ).on(table.conversationId, table.assignedUserId),
    conversationManagerIdx: uniqueIndex(
      "conversation_members_conversation_manager_idx",
    ).on(table.conversationId, table.managerId),
  }),
);

/**
 * Task - Work items assigned to users
 */
export const tasks = pgTable(
  "tasks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    assignedUserId: text("assigned_user_id")
      .notNull()
      .references(() => assignedUsers.id, { onDelete: "cascade" }),
    managerId: text("manager_id")
      .notNull()
      .references(() => managers.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatusEnum("status").notNull().default("TODO"),
    priority: taskPriorityEnum("priority").notNull().default("MEDIUM"),
    dueDate: timestamp("due_date"),
    whatsappMessageId: text("whatsapp_message_id").unique(),
    // WhatsApp integration field (legacy name: matrixEventId)
    // For Baileys: Stores WhatsApp message ID for the task assignment message
    matrixEventId: text("matrix_event_id").unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    projectIdIdx: index("tasks_project_id_idx").on(table.projectId),
    assignedUserIdIdx: index("tasks_assigned_user_id_idx").on(
      table.assignedUserId,
    ),
    managerIdIdx: index("tasks_manager_id_idx").on(table.managerId),
    conversationIdIdx: index("tasks_conversation_id_idx").on(
      table.conversationId,
    ),
    statusIdx: index("tasks_status_idx").on(table.status),
    whatsappMessageIdIdx: index("tasks_whatsapp_message_id_idx").on(
      table.whatsappMessageId,
    ),
    matrixEventIdIdx: index("tasks_matrix_event_id_idx").on(
      table.matrixEventId,
    ),
  }),
);

/**
 * TaskUpdate - WhatsApp messages sent by assigned users in response to tasks
 */
export const taskUpdates = pgTable(
  "task_updates",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    assignedUserId: text("assigned_user_id")
      .notNull()
      .references(() => assignedUsers.id, { onDelete: "cascade" }),
    whatsappMessageId: text("whatsapp_message_id").notNull().unique(),
    // WhatsApp integration field (legacy name: matrixEventId)
    // For Baileys: Stores WhatsApp message ID for the update message
    matrixEventId: text("matrix_event_id").unique(),
    messageText: text("message_text"),
    messageType: messageTypeEnum("message_type").notNull().default("TEXT"),
    analyzedByAI: boolean("analyzed_by_ai").notNull().default(false),
    aiAnalysis: json("ai_analysis").$type<{
      status?: "todo" | "in_progress" | "done" | "blocked" | "feedback_needed";
      sentiment?: "positive" | "neutral" | "negative";
      progress?: number;
      summary?: string;
      keywords?: string[];
    }>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    taskIdIdx: index("task_updates_task_id_idx").on(table.taskId),
    assignedUserIdIdx: index("task_updates_assigned_user_id_idx").on(
      table.assignedUserId,
    ),
    createdAtIdx: index("task_updates_created_at_idx").on(table.createdAt),
    whatsappMessageIdIdx: index("task_updates_whatsapp_message_id_idx").on(
      table.whatsappMessageId,
    ),
    matrixEventIdIdx: index("task_updates_matrix_event_id_idx").on(
      table.matrixEventId,
    ),
  }),
);

/**
 * TaskAttachment - Files/media sent via WhatsApp
 */
export const taskAttachments = pgTable(
  "task_attachments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    taskUpdateId: text("task_update_id")
      .notNull()
      .references(() => taskUpdates.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    fileType: text("file_type").notNull(),
    fileSize: integer("file_size"),
    storageUrl: text("storage_url").notNull(),
    mimeType: text("mime_type"),
    whatsappMediaId: text("whatsapp_media_id"),
    // WhatsApp integration field (legacy name: matrixMxcUrl)
    // For Baileys: Not needed, media is downloaded directly
    matrixMxcUrl: text("matrix_mxc_url"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    taskUpdateIdIdx: index("task_attachments_task_update_id_idx").on(
      table.taskUpdateId,
    ),
    taskIdIdx: index("task_attachments_task_id_idx").on(table.taskId),
  }),
);

/**
 * Reminder - Configuration for task reminders
 */
export const reminders = pgTable(
  "reminders",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    frequency: reminderFrequencyEnum("frequency").notNull().default("ONCE"),
    nextReminderAt: timestamp("next_reminder_at"),
    lastSentAt: timestamp("last_sent_at"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    taskIdIdx: index("reminders_task_id_idx").on(table.taskId),
    conversationIdIdx: index("reminders_conversation_id_idx").on(
      table.conversationId,
    ),
    nextReminderIdx: index("reminders_next_reminder_idx").on(
      table.nextReminderAt,
      table.isActive,
    ),
  }),
);

// ============================================================================
// RELATIONS
// ============================================================================

export const managersRelations = relations(managers, ({ many }) => ({
  projects: many(projects),
  createdUsers: many(assignedUsers),
  createdTasks: many(tasks),
  conversationMembers: many(conversationMembers),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  manager: one(managers, {
    fields: [projects.managerId],
    references: [managers.id],
  }),
  assignedUsers: many(assignedUsers),
  tasks: many(tasks),
}));

export const assignedUsersRelations = relations(
  assignedUsers,
  ({ one, many }) => ({
    project: one(projects, {
      fields: [assignedUsers.projectId],
      references: [projects.id],
    }),
    manager: one(managers, {
      fields: [assignedUsers.managerId],
      references: [managers.id],
    }),
    tasks: many(tasks),
    taskUpdates: many(taskUpdates),
    conversationMembers: many(conversationMembers),
  }),
);

export const conversationsRelations = relations(conversations, ({ many }) => ({
  members: many(conversationMembers),
  tasks: many(tasks),
  reminders: many(reminders),
}));

export const conversationMembersRelations = relations(
  conversationMembers,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationMembers.conversationId],
      references: [conversations.id],
    }),
    assignedUser: one(assignedUsers, {
      fields: [conversationMembers.assignedUserId],
      references: [assignedUsers.id],
    }),
    manager: one(managers, {
      fields: [conversationMembers.managerId],
      references: [managers.id],
    }),
  }),
);

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  assignedUser: one(assignedUsers, {
    fields: [tasks.assignedUserId],
    references: [assignedUsers.id],
  }),
  manager: one(managers, {
    fields: [tasks.managerId],
    references: [managers.id],
  }),
  conversation: one(conversations, {
    fields: [tasks.conversationId],
    references: [conversations.id],
  }),
  updates: many(taskUpdates),
  attachments: many(taskAttachments),
  reminders: many(reminders),
}));

export const taskUpdatesRelations = relations(taskUpdates, ({ one, many }) => ({
  task: one(tasks, {
    fields: [taskUpdates.taskId],
    references: [tasks.id],
  }),
  assignedUser: one(assignedUsers, {
    fields: [taskUpdates.assignedUserId],
    references: [assignedUsers.id],
  }),
  attachments: many(taskAttachments),
}));

export const taskAttachmentsRelations = relations(
  taskAttachments,
  ({ one }) => ({
    taskUpdate: one(taskUpdates, {
      fields: [taskAttachments.taskUpdateId],
      references: [taskUpdates.id],
    }),
    task: one(tasks, {
      fields: [taskAttachments.taskId],
      references: [tasks.id],
    }),
  }),
);

export const remindersRelations = relations(reminders, ({ one }) => ({
  task: one(tasks, {
    fields: [reminders.taskId],
    references: [tasks.id],
  }),
  conversation: one(conversations, {
    fields: [reminders.conversationId],
    references: [conversations.id],
  }),
}));
