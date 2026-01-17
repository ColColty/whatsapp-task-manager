# WhatsApp Integration Setup Guide (Baileys)

This guide will help you set up the WhatsApp integration using Baileys library for direct WhatsApp Web API access.

## Overview

The WhatsApp integration uses **Baileys** (@whiskeysockets/baileys), which connects directly to WhatsApp Web's WebSocket API. This approach:
- ✅ Requires only your WhatsApp phone number
- ✅ Works via QR code scan (just like WhatsApp Web)
- ✅ No external services or API keys needed
- ✅ Full group creation and management support
- ✅ Can run on any server

## Prerequisites

1. **A WhatsApp account** with an active phone number
2. **Node.js** 18+ and npm
3. **PostgreSQL** database
4. **Access to your phone** for QR code scanning

## Installation Steps

### 1. Install Dependencies

```bash
npm install --legacy-peer-deps
```

### 2. Set Up Database

```bash
# Create PostgreSQL database
createdb whatsapp_task_manager

# Configure environment
cp .env.example .env

# Edit .env with your database URL
# DATABASE_URL="postgresql://user:password@localhost:5432/whatsapp_task_manager"

# Generate and apply database schema
npm run db:generate
npm run db:push
```

### 3. Configure Environment Variables

Edit `.env` file:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/whatsapp_task_manager"

# Clerk Authentication (for managers)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."

# WhatsApp via Baileys
# No configuration needed - authentication happens via QR code
# Session data stored in ./whatsapp-session directory
```

### 4. Start the Application

```bash
npm run dev
```

### 5. Authenticate with WhatsApp

On first run, the application will:
1. Generate a QR code in the terminal
2. Wait for you to scan it with your WhatsApp mobile app

**To authenticate:**

1. Open WhatsApp on your phone
2. Go to Settings → Linked Devices
3. Tap "Link a Device"
4. Scan the QR code shown in your terminal

Once authenticated, the session is saved to `./whatsapp-session` directory and you won't need to scan again unless you log out.

### 6. Verify Connection

Check the terminal logs for:
```
WhatsApp connection opened successfully!
Message handler started listening for WhatsApp messages
```

## Usage

### Creating a WhatsApp Group for Task Management

```typescript
import { trpc } from "~/utils/api";

// 1. Create a conversation (WhatsApp group)
const conversation = await trpc.conversations.create.mutate({
  name: "Garden Project Team",
  managerId: "manager_id_from_clerk",
  assignedUserIds: ["worker1_id", "worker2_id"], // Must have phone numbers
  type: "GROUP",
});

// This will:
// - Create a WhatsApp group with the specified name
// - Add all workers by their phone numbers
// - Save group info to database
```

### Assigning a Task

```typescript
// 2. Create and assign a task
const task = await trpc.tasks.create.mutate({
  projectId: "project_id",
  conversationId: conversation.id,
  title: "Install new fence posts",
  description: "Replace 5 damaged posts on the east side",
  managerId: "manager_id",
  assignedUserId: "worker1_id",
  dueDate: new Date("2026-02-01"),
  priority: "HIGH",
});

// This will:
// - Save task to database
// - Send formatted message to WhatsApp group
// - Worker receives notification on their phone
```

### Receiving Updates from Workers

Workers simply reply in WhatsApp:

```
Worker: "Started working on it, here's a photo"
[Attaches photo]
```

The system automatically:
- Detects status from message ("Started" → IN_PROGRESS)
- Saves update to database
- Stores attached photo
- Updates task status

### Checking Task Status

```typescript
// Get task with all updates
const task = await trpc.tasks.getById.query({
  taskId: task.id,
});

// View all updates and attachments
console.log(task.updates); // All messages from workers
console.log(task.attachments); // All photos/videos
```

## Phone Number Format

Workers must have phone numbers in the database. Format requirements:

- **Include country code** (e.g., "12125551234" for US)
- **No special characters** (no +, -, spaces, parentheses)
- **Numbers only**: "12125551234" ✅
- **Not:** "+1 (212) 555-1234" ❌

Example:
```typescript
// When creating an assigned user
const worker = await db.insert(assignedUsers).values({
  projectId: "project_id",
  managerId: "manager_id",
  name: "John Worker",
  phoneNumber: "12125551234", // Correct format
});
```

## Session Management

### Session Storage

WhatsApp session data is stored in `./whatsapp-session/` directory:
```
whatsapp-session/
├── creds.json          # Authentication credentials
└── app-state-sync-*    # Sync state files
```

**Important:**
- ⚠️ Keep this directory secure (it's in .gitignore)
- ⚠️ Backup this directory for disaster recovery
- ⚠️ Don't delete while app is running

### Re-authentication

If you need to re-authenticate:

1. Stop the application
2. Delete the `./whatsapp-session` directory
3. Start the application
4. Scan the new QR code

## Troubleshooting

### QR Code Not Showing

**Problem:** QR code doesn't appear in terminal

**Solutions:**
1. Check terminal supports Unicode/graphics
2. Verify Baileys is installed: `npm list @whiskeysockets/baileys`
3. Check logs for errors during initialization

### Connection Closes Immediately

**Problem:** "Connection closed" message appears

**Possible causes:**
1. **Phone not connected to internet** - Ensure phone has internet
2. **WhatsApp Web limit reached** - Log out from other devices
3. **Corrupted session** - Delete `./whatsapp-session` and re-scan

**Solution:**
```bash
rm -rf ./whatsapp-session
npm run dev
# Scan QR code again
```

### Messages Not Being Received

**Problem:** Workers send messages but they don't appear in database

**Debug steps:**
1. Check message handler is running:
   ```
   Message handler started listening for WhatsApp messages
   ```

2. Check worker's phone number matches database:
   ```sql
   SELECT * FROM assigned_users WHERE phone_number = '12125551234';
   ```

3. Check conversation exists:
   ```sql
   SELECT * FROM conversations WHERE matrix_room_id = 'GROUP_JID';
   ```

4. Check message handler logs for errors

### Group Creation Fails

**Problem:** `createGroup` returns error

**Common causes:**
1. **Invalid phone number format** - Ensure numbers only, with country code
2. **Phone number not on WhatsApp** - Verify numbers have WhatsApp accounts
3. **Rate limiting** - Wait before creating another group

## API Reference

### Conversations Router

```typescript
// Create WhatsApp group
trpc.conversations.create.mutate({
  name: string,
  managerId: string,
  assignedUserIds: string[],
  type: "GROUP" | "PERSONAL"
})

// List conversations for manager
trpc.conversations.listByManager.query({ managerId })

// Get conversation details
trpc.conversations.getById.query({ conversationId })

// Add participant to group
trpc.conversations.addParticipant.mutate({
  conversationId,
  assignedUserId
})
```

### Tasks Router

```typescript
// Create task
trpc.tasks.create.mutate({
  projectId: string,
  conversationId: string,
  title: string,
  description?: string,
  managerId: string,
  assignedUserId: string,
  dueDate?: Date,
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT"
})

// List tasks
trpc.tasks.listByConversation.query({ conversationId })
trpc.tasks.listByUser.query({ assignedUserId })

// Update status
trpc.tasks.updateStatus.mutate({
  taskId,
  status: "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED" | "FEEDBACK_NEEDED"
})

// Send reminder
trpc.tasks.sendReminder.mutate({ taskId })
```

## Production Deployment

### Important Considerations

⚠️ **WhatsApp Terms of Service:** Baileys is an unofficial library. Review WhatsApp's Terms of Service before production use.

### Docker Deployment

Example `docker-compose.yml`:

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./whatsapp-session:/app/whatsapp-session
    environment:
      - DATABASE_URL=postgresql://...
      - CLERK_SECRET_KEY=...
    restart: unless-stopped
```

### Session Persistence

Ensure `./whatsapp-session` directory persists across deployments and restarts.

## Support

- **Baileys Documentation:** https://github.com/WhiskeySockets/Baileys
- **Issues:** Check Baileys GitHub issues

## Next Steps

1. ✅ Complete database setup
2. ✅ Scan QR code and authenticate
3. ✅ Create your first project and assigned users
4. ✅ Create a test WhatsApp group
5. ✅ Assign a test task
6. ✅ Send a message from worker's phone
7. ✅ Verify it appears in database

Happy task managing! 🎉
