# WhatsApp Bot Integration - Migration to Drizzle

## Summary

Successfully migrated the WhatsApp bot integration from Prisma to Drizzle ORM to align with the existing codebase.

## Changes Made

### 1. Database Layer
- ✅ Removed Prisma dependencies and files
- ✅ Added Drizzle ORM with PostgreSQL support
- ✅ Extended existing schema with Matrix/Beeper bridge fields:
  - `managers.matrixUserId` - Matrix user ID for managers
  - `assignedUsers.matrixUserId` - Matrix user ID for workers
  - `conversations.matrixRoomId` - Matrix room ID for WhatsApp groups
  - `tasks.matrixEventId` - Matrix event ID for task messages
  - `taskUpdates.matrixEventId` - Matrix event ID for update messages
  - `taskAttachments.matrixMxcUrl` - Matrix media URL for attachments

### 2. Services Updated
- ✅ `matrix-client.ts` - Matrix/Beeper client (no changes needed)
- ✅ `whatsapp-bridge.ts` - Updated to use Drizzle and existing schema structure
- ✅ `message-handler.ts` - Updated to use Drizzle and existing schema

### 3. Schema Alignment
The integration now properly uses the existing schema:
- Uses `conversations` (not `groups`)
- Uses `assignedUsers` (workers) and `managers` (authenticated users)
- Uses `taskUpdates` for messages from workers
- Uses `taskAttachments` for media files
- Uses `projects` to organize work

### 4. Configuration
- ✅ Updated `package.json` scripts for Drizzle
- ✅ Created `drizzle.config.ts`
- ✅ Updated `.env.example` for PostgreSQL
- ✅ Created `src/server/db/index.ts` for database connection

## What Still Needs Work

### tRPC Routers
The following routers need to be updated to use Drizzle queries:
- `/src/server/api/routers/tasks.ts` - Currently has old Prisma code
- Need to create `/src/server/api/routers/conversations.ts` (replaces groups.ts)
- Need to remove references to old routers in `root.ts`

### Example Update Pattern

**Old (Prisma):**
```typescript
const task = await ctx.db.task.findUnique({
  where: { id: taskId },
  include: {
    assignedUser: true,
    updates: true,
  },
});
```

**New (Drizzle):**
```typescript
const [task] = await db.query.tasks.findMany({
  where: eq(tasks.id, taskId),
  with: {
    assignedUser: true,
    updates: true,
  },
  limit: 1,
});
```

## Next Steps

1. **Update Tasks Router** (`src/server/api/routers/tasks.ts`)
   - Replace Prisma queries with Drizzle
   - Update to use `projectId`, `conversationId`, `assignedUserId`, `managerId`

2. **Create Conversations Router** (new file)
   - Create conversations (WhatsApp groups)
   - List conversations for a manager
   - Add participants to conversations
   - Get conversation statistics

3. **Update Root Router** (`src/server/api/root.ts`)
   - Import new conversations router
   - Remove old groups/messages/attachments routers
   - Export updated app router

4. **Database Setup**
   - Run `npm run db:generate` to create migrations
   - Run `npm run db:push` to apply schema
   - Set up PostgreSQL database
   - Configure `.env` with database credentials

5. **Testing**
   - Set up Beeper bridge with `bbctl`
   - Test conversation creation
   - Test task assignment
   - Test message receiving and AI analysis
   - Test attachment handling

## Architecture

```
WhatsApp (Personal Phone)
    ↕
Beeper/Matrix Bridge (mautrix-whatsapp)
    ↕
Matrix Server (matrix.beeper.com)
    ↕
Matrix SDK (matrix-js-sdk)
    ↕
Task Manager Services
    ↕
Drizzle ORM
    ↕
PostgreSQL Database
```

## Key Features

- ✅ Create WhatsApp groups via Matrix bridge
- ✅ Send task assignments to WhatsApp
- ✅ Receive and process WhatsApp messages
- ✅ AI-powered task status detection
- ✅ Attachment handling (photos/videos/documents)
- ✅ Automatic message-to-task linking
- ✅ Task reminders via WhatsApp
- ✅ Multi-project support
- ✅ Manager and worker role separation

## Files Created/Modified

### Created:
- `src/server/db/schema.ts` - Extended schema with Matrix fields
- `src/server/db/index.ts` - Database connection
- `src/server/services/matrix-client.ts` - Matrix/WhatsApp client
- `src/server/services/whatsapp-bridge.ts` - High-level operations
- `src/server/services/message-handler.ts` - Incoming message processor
- `drizzle.config.ts` - Drizzle configuration
- `WHATSAPP_SETUP.md` - Complete setup guide

### Modified:
- `package.json` - Drizzle dependencies and scripts
- `.env.example` - Database and Matrix configuration
- `src/env.js` - Added Matrix environment variables
- `.gitignore` - Added database files
- `src/server/api/trpc.ts` - Added db to context

### To Be Updated:
- `src/server/api/routers/tasks.ts` - Needs Drizzle migration
- `src/server/api/root.ts` - Needs router updates
