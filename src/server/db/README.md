# Database Schema

This document describes the database schema for the WhatsApp Task Manager application using Drizzle ORM.

## Overview

The database is designed to support a task management system where:
- **Managers** have Clerk authentication accounts and manage projects and tasks
- **Assigned Users** are created by managers, don't have Clerk accounts, and interact via WhatsApp
- **Tasks** are communicated through WhatsApp conversations
- **Updates** and **Attachments** are automatically captured from WhatsApp messages
- **AI Analysis** helps understand task status from user messages

## Core Models

### Manager
Users with Clerk authentication who manage everything.
- Has Clerk account and authentication
- Can create projects and assign users
- Can create and manage tasks
- Can participate in WhatsApp conversations

**Fields:**
- `id` - Primary key (CUID)
- `clerkId` - Unique Clerk user ID
- `email` - Unique email address
- `name` - Optional display name
- `phoneNumber` - Optional phone number
- `createdAt` - Timestamp
- `updatedAt` - Timestamp (auto-updates)

### Project
Work projects (e.g., garden, builds).
- Owned by a manager
- Contains multiple assigned users
- Contains multiple tasks

**Fields:**
- `id` - Primary key (CUID)
- `managerId` - Foreign key to Manager
- `name` - Project name
- `description` - Optional description
- `createdAt` - Timestamp
- `updatedAt` - Timestamp (auto-updates)

### AssignedUser
Workers created by managers, linked to projects.
- **No Clerk account** - Created by managers
- Linked to a specific project
- Identified by WhatsApp phone number
- Can be assigned tasks
- Sends updates via WhatsApp

**Fields:**
- `id` - Primary key (CUID)
- `projectId` - Foreign key to Project
- `managerId` - Foreign key to Manager (creator)
- `name` - User's name
- `phoneNumber` - WhatsApp phone number
- `createdAt` - Timestamp
- `updatedAt` - Timestamp (auto-updates)

**Constraints:**
- Unique: (projectId, phoneNumber) - Each phone number is unique per project

### Conversation
WhatsApp groups or personal chats.
- Can be PERSONAL or GROUP type
- Contains multiple members (managers and/or assigned users)
- Tasks are discussed in conversations
- Reminders are sent to conversations

**Fields:**
- `id` - Primary key (CUID)
- `whatsappConversationId` - Unique WhatsApp conversation ID
- `name` - Optional conversation name
- `type` - Enum: PERSONAL | GROUP
- `createdAt` - Timestamp
- `updatedAt` - Timestamp (auto-updates)

### ConversationMember
Join table for conversation participants.

**Fields:**
- `id` - Primary key (CUID)
- `conversationId` - Foreign key to Conversation
- `assignedUserId` - Optional foreign key to AssignedUser
- `managerId` - Optional foreign key to Manager
- `joinedAt` - Timestamp

**Constraints:**
- Unique: (conversationId, assignedUserId)
- Unique: (conversationId, managerId)

### Task
Work items assigned to users.
- Assigned to one user
- Belongs to a project
- Discussed in a conversation
- Has status and priority
- Can have due date
- Tracks the original WhatsApp message ID when announced

**Fields:**
- `id` - Primary key (CUID)
- `projectId` - Foreign key to Project
- `assignedUserId` - Foreign key to AssignedUser
- `managerId` - Foreign key to Manager (creator)
- `conversationId` - Foreign key to Conversation
- `title` - Task title
- `description` - Optional description
- `status` - Enum: TODO | IN_PROGRESS | DONE | BLOCKED | FEEDBACK_NEEDED
- `priority` - Enum: LOW | MEDIUM | HIGH | URGENT
- `dueDate` - Optional due date
- `whatsappMessageId` - Unique WhatsApp message ID
- `createdAt` - Timestamp
- `updatedAt` - Timestamp (auto-updates)
- `completedAt` - Optional completion timestamp

### TaskUpdate
WhatsApp messages sent by assigned users.
- Replies to task announcements
- Can be TEXT, IMAGE, VIDEO, AUDIO, or DOCUMENT
- Analyzed by AI to understand task status
- AI analysis stored as JSON
- Contains the WhatsApp message ID for tracking

**Fields:**
- `id` - Primary key (CUID)
- `taskId` - Foreign key to Task
- `assignedUserId` - Foreign key to AssignedUser
- `whatsappMessageId` - Unique WhatsApp message ID
- `messageText` - Optional message text
- `messageType` - Enum: TEXT | IMAGE | VIDEO | AUDIO | DOCUMENT
- `analyzedByAI` - Boolean flag
- `aiAnalysis` - JSON object with AI analysis results
  - `status` - Inferred task status
  - `sentiment` - Positive, neutral, or negative
  - `progress` - Progress percentage
  - `summary` - AI-generated summary
  - `keywords` - Extracted keywords
- `createdAt` - Timestamp

### TaskAttachment
Files and media sent via WhatsApp.
- Linked to both task and task update
- Stores file metadata (name, type, size, MIME type)
- References storage URL (S3, Cloudinary, etc.)
- Tracks WhatsApp media ID

**Fields:**
- `id` - Primary key (CUID)
- `taskUpdateId` - Foreign key to TaskUpdate
- `taskId` - Foreign key to Task
- `fileName` - File name
- `fileType` - File type
- `fileSize` - Optional file size in bytes
- `storageUrl` - URL where file is stored
- `mimeType` - Optional MIME type
- `whatsappMediaId` - Optional WhatsApp media ID
- `createdAt` - Timestamp

### Reminder
Configuration for task reminders.
- Linked to a task
- Sent to a specific conversation
- Can be ONCE, DAILY, WEEKLY, or CUSTOM frequency
- Tracks when last sent and when to send next
- Can be activated/deactivated

**Fields:**
- `id` - Primary key (CUID)
- `taskId` - Foreign key to Task
- `conversationId` - Foreign key to Conversation
- `frequency` - Enum: ONCE | DAILY | WEEKLY | CUSTOM
- `nextReminderAt` - Optional next reminder timestamp
- `lastSentAt` - Optional last sent timestamp
- `isActive` - Boolean flag
- `createdAt` - Timestamp
- `updatedAt` - Timestamp (auto-updates)

## Relationships

```
Manager
  ├── creates → Projects
  ├── creates → AssignedUsers
  ├── creates → Tasks
  └── participates in → Conversations

Project
  ├── belongs to → Manager
  ├── contains → AssignedUsers
  └── contains → Tasks

AssignedUser
  ├── belongs to → Project
  ├── created by → Manager
  ├── assigned → Tasks
  ├── sends → TaskUpdates
  └── participates in → Conversations

Task
  ├── belongs to → Project
  ├── assigned to → AssignedUser
  ├── created by → Manager
  ├── discussed in → Conversation
  ├── has → TaskUpdates
  ├── has → TaskAttachments
  └── has → Reminders

TaskUpdate
  ├── belongs to → Task
  ├── sent by → AssignedUser
  └── has → TaskAttachments

Conversation
  ├── has → ConversationMembers
  ├── contains → Tasks
  └── receives → Reminders
```

## Key Features

### Unique Constraints
- Each phone number is unique per project (users can work on multiple projects with same number)
- WhatsApp conversation IDs are unique
- WhatsApp message IDs are unique
- Task announcement message IDs are unique
- Conversation members are unique (per conversation + user/manager)

### Cascading Deletes
- When a Manager is deleted, all their projects, created users, and tasks are deleted
- When a Project is deleted, all its assigned users and tasks are deleted
- When a Task is deleted, all its updates, attachments, and reminders are deleted
- When a Conversation is deleted, all its members are removed

### Indexes
Optimized for common queries:
- Manager lookups by Clerk ID
- Project lookups by manager
- User lookups by project
- Task lookups by project, user, status, and conversation
- Update lookups by task and timestamp
- Reminder lookups by next reminder time and active status
- WhatsApp ID lookups for messages and conversations

## Usage

### Migrations

```bash
# Generate migration files from schema
pnpm db:generate

# Apply migrations to database
pnpm db:migrate

# Push schema changes directly (development only)
pnpm db:push
```

### Drizzle Studio

```bash
# Open Drizzle Studio to view/edit data
pnpm db:studio
```

### Seeding

```bash
# Run seed script to populate database
pnpm db:seed
```

## Environment Variables

Required environment variables in `.env`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/whatsapp_task_manager?schema=public"
```

See `.env.example` for all required environment variables.

## TypeScript Types

Drizzle automatically generates TypeScript types from the schema. Import them like this:

```typescript
import { db } from "~/server/db";
import { tasks, type Task } from "~/server/db/schema";

// Query with full type safety
const allTasks = await db.query.tasks.findMany({
  with: {
    assignedUser: true,
    project: true,
  },
});

// Insert with type checking
const newTask: typeof tasks.$inferInsert = {
  title: "Paint the fence",
  projectId: "...",
  assignedUserId: "...",
  managerId: "...",
  conversationId: "...",
};

await db.insert(tasks).values(newTask);
```

## Best Practices

1. **Use transactions** for operations that modify multiple tables
2. **Use the relational query API** for complex queries with joins
3. **Index foreign keys** for better query performance (already done)
4. **Validate data** with Zod before inserting
5. **Use prepared statements** for frequently executed queries
6. **Monitor query performance** with Drizzle Studio
