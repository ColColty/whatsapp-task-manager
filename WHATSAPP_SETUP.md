# WhatsApp Task Manager Setup Guide

This guide will help you set up the WhatsApp Task Manager using Beeper bridge and Matrix.

## Prerequisites

1. **Beeper Account**: Sign up at [beeper.com](https://beeper.com)
2. **Node.js**: Version 18 or higher
3. **Personal Phone Number**: For WhatsApp connection

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

## Step 3: Configure Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Database
DATABASE_URL="file:./dev.db"

# Matrix/Beeper Configuration
MATRIX_HOMESERVER_URL="https://matrix.beeper.com"
MATRIX_USER_ID="@your-username:beeper.com"
MATRIX_ACCESS_TOKEN="your_access_token_here"
MATRIX_DEVICE_ID="your_device_id"  # Optional
```

## Step 4: Initialize Database

Generate Prisma client and create the database:

```bash
# Generate Prisma client
npx prisma generate

# Create database tables
npx prisma db push
```

## Step 5: Start the Application

```bash
# Install dependencies (if not already done)
npm install --legacy-peer-deps

# Start development server
npm run dev
```

The server will:
1. Initialize the Matrix client
2. Start listening for WhatsApp messages
3. Start the Next.js development server

## How It Works

### Architecture

```
WhatsApp (Phone)
    ↕
Beeper/Matrix Bridge (bbctl + mautrix-whatsapp)
    ↕
Matrix Server (matrix.beeper.com)
    ↕
Your Task Manager App (Matrix SDK)
    ↕
Database (SQLite/PostgreSQL)
```

### Key Features

1. **Create Groups**: Create WhatsApp groups for task management
2. **Assign Tasks**: Send task assignments to group members
3. **Track Progress**: Receive updates via WhatsApp messages
4. **AI Analysis**: Automatically detect task completion from messages
5. **Attachments**: Store photos/videos sent by workers
6. **Reminders**: Send task reminders via WhatsApp

## Usage Examples

### Create a Task Group

```typescript
// Using tRPC client
const group = await trpc.groups.create.mutate({
  name: "Garden Tasks",
  description: "Task management for garden work",
  managerUserId: "@manager:beeper.com",
  memberUserIds: ["@worker1:beeper.com", "@worker2:beeper.com"]
});
```

This will:
1. Create a Matrix room
2. Invite all participants
3. Convert it to a WhatsApp group using `!wa create`

### Create a Task

```typescript
const task = await trpc.tasks.create.mutate({
  groupId: group.id,
  title: "Fix the fence",
  description: "Repair the broken section of the garden fence",
  createdByUserId: "@manager:beeper.com",
  assigneeUserId: "@worker1:beeper.com",
  dueDate: new Date("2025-11-30"),
  priority: "HIGH"
});
```

This will send a WhatsApp message to the group with the task details.

### Get User's Tasks

```typescript
const tasks = await trpc.tasks.listByUser.query({
  userId: "@worker1:beeper.com",
  status: "PENDING" // Optional filter
});
```

### Send a Message

```typescript
await trpc.messages.send.mutate({
  groupId: group.id,
  content: "Great work on the fence!",
  senderId: "@manager:beeper.com"
});
```

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
# Generate Prisma client
npx prisma generate

# Apply schema changes
npx prisma db push

# Open Prisma Studio (database GUI)
npx prisma studio

# Reset database (careful!)
npx prisma db push --force-reset
```

## API Routes

### Groups
- `groups.create` - Create a new WhatsApp group
- `groups.list` - List all groups for a user
- `groups.getById` - Get group details
- `groups.addParticipant` - Add a user to a group
- `groups.getStats` - Get group statistics

### Tasks
- `tasks.create` - Create a new task
- `tasks.listByGroup` - List tasks in a group
- `tasks.listByUser` - List tasks for a user
- `tasks.getById` - Get task details
- `tasks.updateStatus` - Update task status
- `tasks.update` - Update task details
- `tasks.sendReminder` - Send a task reminder
- `tasks.getOverdue` - Get overdue tasks

### Messages
- `messages.send` - Send a message to a group
- `messages.listByGroup` - List messages in a group
- `messages.listByTask` - List messages for a task
- `messages.search` - Search messages

### Attachments
- `attachments.listByTask` - List attachments for a task
- `attachments.listByGroup` - List attachments in a group
- `attachments.getStats` - Get attachment statistics

## Troubleshooting

### Bridge Not Connecting

1. Check bridge status: `bbctl status sh-whatsapp`
2. Check logs: `bbctl logs sh-whatsapp`
3. Restart bridge: `bbctl restart sh-whatsapp`

### Messages Not Being Received

1. Verify Matrix client is initialized (check server logs)
2. Ensure the group exists in the database
3. Check that the bridge is running: `bbctl status sh-whatsapp`

### WhatsApp Account Issues

If your WhatsApp gets blocked:
- Use a dedicated phone number (not your personal one)
- Avoid sending too many messages at once
- Follow WhatsApp's usage guidelines
- Consider using WhatsApp Business number

### Database Issues

```bash
# Reset database if needed
npx prisma db push --force-reset

# Regenerate client
npx prisma generate
```

## Production Deployment

### Environment Variables

For production, set these environment variables:

```env
NODE_ENV="production"
DATABASE_URL="postgresql://user:password@host:5432/dbname"  # Use PostgreSQL
MATRIX_HOMESERVER_URL="https://matrix.beeper.com"
MATRIX_USER_ID="@bot:beeper.com"
MATRIX_ACCESS_TOKEN="..."
```

### Database Migration

For production, use PostgreSQL instead of SQLite:

1. Update `prisma/schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

2. Run migrations:
```bash
npx prisma migrate dev --name init
npx prisma generate
```

### Keep Bridge Running

Use a process manager to keep the bridge running:

```bash
# Using systemd, PM2, or similar
pm2 start "bbctl run sh-whatsapp"
pm2 save
```

## Security Considerations

1. **Never commit `.env` file** - It contains sensitive credentials
2. **Use environment variables** - Don't hardcode credentials
3. **Limit access** - Use proper authentication for your API
4. **Validate input** - Always validate user input
5. **Rate limiting** - Implement rate limiting for WhatsApp messages

## Support

For issues with:
- **Beeper/bbctl**: https://github.com/beeper/bridge-manager
- **mautrix-whatsapp**: https://docs.mau.fi/bridges/go/whatsapp/
- **This project**: Check the code comments and tRPC API documentation

## License

This project is for authorized use only. Make sure you comply with WhatsApp's Terms of Service.
