# WhatsApp Task Manager Setup Guide

This guide will help you set up the WhatsApp Task Manager using Beeper bridge and Matrix.

## Prerequisites

1. **Beeper Account**: Sign up at [beeper.com](https://beeper.com)
2. **Node.js**: Version 18 or higher
3. **PostgreSQL**: Database server
4. **Personal Phone Number**: For WhatsApp connection

## Step 1: Set Up Beeper Bridge

### Install bbctl (Beeper Bridge Manager)

```bash
# Download and install bbctl
curl -sL https://github.com/beeper/bridge-manager/releases/latest/download/bbctl-linux-amd64 -o bbctl
chmod +x bbctl
sudo mv bbctl /usr/local/bin/
```

### Login to Beeper

```bash
bbctl login
```

Follow the prompts to log in with your Beeper account.

### Set Up WhatsApp Bridge

```bash
bbctl run sh-whatsapp
```

This will:
1. Download and configure the mautrix-whatsapp bridge
2. Start the bridge
3. Prompt you to scan a QR code with your WhatsApp phone

**Important**: Keep your phone connected during the QR code scanning process.

### Verify Bridge Status

```bash
bbctl status sh-whatsapp
```

The bridge should show as "running".

## Step 2: Get Your Matrix Credentials

### Get Your Access Token

1. Go to Beeper settings in your desktop/web app
2. Navigate to "Advanced" → "Access Token"
3. Copy your access token

### Get Your User ID

Your Matrix user ID format: `@your-username:beeper.com`

You can find it in Beeper settings under "Account".

### Get Your Device ID (Optional)

In Beeper settings, you can find your device ID under "Sessions" or "Devices".

## Step 3: Set Up PostgreSQL Database

Create a PostgreSQL database for the application:

```bash
# Create database
createdb whatsapp_task_manager

# Or with explicit user
createdb -U postgres whatsapp_task_manager
```

## Step 4: Configure Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Database - PostgreSQL
DATABASE_URL="postgresql://user:password@localhost:5432/whatsapp_task_manager"

# Matrix/Beeper Configuration
MATRIX_HOMESERVER_URL="https://matrix.beeper.com"
MATRIX_USER_ID="@your-username:beeper.com"
MATRIX_ACCESS_TOKEN="your_access_token_here"
MATRIX_DEVICE_ID="your_device_id"  # Optional
```

## Step 5: Initialize Database

Generate Drizzle migrations and push schema:

```bash
# Install dependencies
npm install

# Generate migrations
npm run db:generate

# Push schema to database
npm run db:push
```

## Step 6: Start the Application

```bash
# Start development server
npm run dev
```

The server will:
1. Initialize the Matrix client
2. Start listening for WhatsApp messages
3. Start the Next.js development server on http://localhost:3000

## How It Works

### Architecture

```
WhatsApp (Personal Phone)
    ↕
Beeper/Matrix Bridge (mautrix-whatsapp via bbctl)
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

### Data Model

- **Managers**: Authenticated users (via Clerk) who create projects and assign tasks
- **Projects**: Work projects (e.g., "Garden Work", "Building Construction")
- **Assigned Users**: Workers without accounts who receive tasks via WhatsApp
- **Conversations**: WhatsApp groups or personal chats (linked to Matrix rooms)
- **Tasks**: Work items assigned to users in conversations
- **Task Updates**: Messages from workers about task progress

### Key Features

- ✅ Create WhatsApp groups via Matrix bridge
- ✅ Send task assignments to WhatsApp
- ✅ Receive and process WhatsApp messages
- ✅ AI-powered task status detection
- ✅ Attachment handling (photos/videos/documents)
- ✅ Automatic message-to-task linking
- ✅ Task reminders via WhatsApp
- ✅ Multi-project support
- ✅ Manager and worker role separation

## Usage Examples

### Create a WhatsApp Conversation

```typescript
// Using tRPC client
const conversation = await trpc.conversations.create.mutate({
  name: "Garden Project Workers",
  managerId: "manager_clerk_id_here",
  assignedUserIds: ["assigned_user_1_id", "assigned_user_2_id"],
  type: "GROUP" // or "PERSONAL"
});
```

This will:
1. Create a Matrix room
2. Invite all participants (manager + assigned users)
3. Convert it to a WhatsApp group using `!wa create`
4. Save the conversation to the database

### Create a Task

```typescript
const task = await trpc.tasks.create.mutate({
  projectId: "project_id_here",
  conversationId: conversation.id,
  title: "Fix the fence",
  description: "Repair the broken section of the garden fence",
  managerId: "manager_id_here",
  assignedUserId: "assigned_user_id_here",
  dueDate: new Date("2025-12-01"),
  priority: "HIGH"
});
```

This sends a WhatsApp message to the conversation with the task details.

### Get Tasks for a User

```typescript
const tasks = await trpc.tasks.listByUser.query({
  assignedUserId: "assigned_user_id_here",
  status: "TODO" // Optional filter
});
```

### Get Tasks for a Conversation

```typescript
const tasks = await trpc.tasks.listByConversation.query({
  conversationId: conversation.id,
  status: "IN_PROGRESS" // Optional
});
```

### Get Conversation Stats

```typescript
const stats = await trpc.conversations.getStats.query({
  conversationId: conversation.id
});

// Returns:
// {
//   totalTasks: 10,
//   todoTasks: 3,
//   inProgressTasks: 2,
//   doneTasks: 5,
//   blockedTasks: 0,
//   totalMembers: 5,
//   managers: 1,
//   assignedUsers: 4
// }
```

### Update Task Status

```typescript
await trpc.tasks.updateStatus.mutate({
  taskId: task.id,
  status: "DONE"
});
```

## API Reference

### Conversations
- `conversations.create` - Create a new WhatsApp conversation
- `conversations.listByManager` - List conversations for a manager
- `conversations.getById` - Get conversation details
- `conversations.getByMatrixRoomId` - Find conversation by Matrix room ID
- `conversations.addParticipant` - Add a user to a conversation
- `conversations.getMembers` - Get conversation members
- `conversations.getStats` - Get conversation statistics
- `conversations.listAll` - List all conversations
- `conversations.update` - Update conversation name
- `conversations.removeParticipant` - Remove a participant

### Tasks
- `tasks.create` - Create a new task
- `tasks.listByConversation` - List tasks in a conversation
- `tasks.listByUser` - List tasks for an assigned user
- `tasks.listByProject` - List tasks in a project
- `tasks.getById` - Get task details with updates and attachments
- `tasks.updateStatus` - Update task status
- `tasks.update` - Update task details
- `tasks.delete` - Delete a task
- `tasks.sendReminder` - Send a task reminder via WhatsApp
- `tasks.getOverdue` - Get overdue tasks
- `tasks.getStats` - Get task statistics

## Task Statuses

The system uses these task statuses (matching the database schema):

- `TODO` - Task not started
- `IN_PROGRESS` - Task is being worked on
- `DONE` - Task completed
- `BLOCKED` - Task is blocked by something
- `FEEDBACK_NEEDED` - Worker needs help or clarification

## Automatic Status Detection

When workers send messages via WhatsApp, the system automatically analyzes them:

**Completion keywords**: "done", "finished", "completed", "ready" → Sets status to `DONE`
**Progress keywords**: "working on", "started", "in progress" → Sets status to `IN_PROGRESS`
**Blocked keywords**: "stuck", "blocked", "can't", "problem" → Sets status to `BLOCKED`
**Feedback keywords**: "help", "question", "how" → Sets status to `FEEDBACK_NEEDED`

## Command Reference

### bbctl Commands

```bash
# Check bridge status
bbctl status sh-whatsapp

# Stop bridge
bbctl stop sh-whatsapp

# Restart bridge
bbctl restart sh-whatsapp

# View bridge logs
bbctl logs sh-whatsapp

# Delete bridge (removes everything)
bbctl delete sh-whatsapp
```

### Database Commands

```bash
# Generate migrations
npm run db:generate

# Push schema to database
npm run db:push

# Migrate database
npm run db:migrate

# Open Drizzle Studio (database GUI)
npm run db:studio
```

## Troubleshooting

### Bridge Not Connecting

1. Check bridge status: `bbctl status sh-whatsapp`
2. Check logs: `bbctl logs sh-whatsapp`
3. Restart bridge: `bbctl restart sh-whatsapp`
4. Ensure WhatsApp phone is connected to internet

### Messages Not Being Received

1. Verify Matrix client is initialized (check server logs)
2. Ensure the conversation exists in the database
3. Check that the bridge is running: `bbctl status sh-whatsapp`
4. Verify the conversation has `matrixRoomId` set

### WhatsApp Account Issues

If your WhatsApp gets blocked:
- Use a dedicated phone number (not your personal one)
- Avoid sending too many messages at once
- Follow WhatsApp's usage guidelines
- Consider using WhatsApp Business number

### Database Connection Issues

```bash
# Check PostgreSQL is running
pg_isready

# Test connection
psql -d whatsapp_task_manager -c "SELECT 1"

# Check DATABASE_URL in .env
cat .env | grep DATABASE_URL
```

### Matrix Client Errors

If you see "Matrix client not initialized":
- Check your Matrix credentials in `.env`
- Ensure `MATRIX_ACCESS_TOKEN` is valid
- Verify `MATRIX_USER_ID` format is correct (`@username:beeper.com`)
- Check server logs for initialization errors

## Production Deployment

### Environment Variables

For production, ensure these are set:

```env
NODE_ENV="production"
DATABASE_URL="postgresql://user:password@host:5432/dbname"
MATRIX_HOMESERVER_URL="https://matrix.beeper.com"
MATRIX_USER_ID="@bot:beeper.com"
MATRIX_ACCESS_TOKEN="..."
MATRIX_DEVICE_ID="..."
```

### Database Setup

1. Create production database
2. Run migrations: `npm run db:migrate`
3. Set up automatic backups

### Keep Bridge Running

Use a process manager to keep the bridge running:

```bash
# Using PM2
pm2 start "bbctl run sh-whatsapp" --name whatsapp-bridge
pm2 save
pm2 startup

# Or use systemd service
```

### Monitoring

Monitor these services:
- PostgreSQL database
- Beeper bridge (bbctl)
- Matrix client connection
- Next.js application

## Security Considerations

1. **Never commit `.env` file** - Contains sensitive credentials
2. **Use environment variables** - Don't hardcode credentials
3. **Limit access** - Use proper authentication (Clerk) for managers
4. **Validate input** - All user input is validated via Zod schemas
5. **Rate limiting** - Implement rate limiting for WhatsApp messages
6. **Database security** - Use strong PostgreSQL passwords
7. **Matrix token security** - Keep access tokens secure

## Data Flow

### Creating a Task:
1. Manager creates task via UI → tRPC API
2. Task saved to PostgreSQL
3. Matrix client sends message to WhatsApp group
4. Message appears in WhatsApp for assigned user

### Receiving an Update:
1. Worker sends WhatsApp message/photo
2. Bridge forwards to Matrix
3. Message handler receives Matrix event
4. AI analyzes message content
5. TaskUpdate created in database
6. Task status auto-updated if detected
7. Attachments saved with metadata

## Support

For issues with:
- **Beeper/bbctl**: https://github.com/beeper/bridge-manager
- **mautrix-whatsapp**: https://docs.mau.fi/bridges/go/whatsapp/
- **Drizzle ORM**: https://orm.drizzle.team/docs/overview
- **This project**: Check `MIGRATION_SUMMARY.md` for architecture details

## License

This project is for authorized use only. Make sure you comply with WhatsApp's Terms of Service.
