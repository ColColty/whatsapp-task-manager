# Database Schema

This document describes the database schema for the WhatsApp Task Manager application.

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

### Project
Work projects (e.g., garden, builds).
- Owned by a manager
- Contains multiple assigned users
- Contains multiple tasks

### AssignedUser
Workers created by managers, linked to projects.
- **No Clerk account** - Created by managers
- Linked to a specific project
- Identified by WhatsApp phone number
- Can be assigned tasks
- Sends updates via WhatsApp

### Conversation
WhatsApp groups or personal chats.
- Can be PERSONAL or GROUP type
- Contains multiple members (managers and/or assigned users)
- Tasks are discussed in conversations
- Reminders are sent to conversations

### Task
Work items assigned to users.
- Assigned to one user
- Belongs to a project
- Discussed in a conversation
- Has status (TODO, IN_PROGRESS, DONE, BLOCKED, FEEDBACK_NEEDED)
- Has priority (LOW, MEDIUM, HIGH, URGENT)
- Can have due date
- Tracks the original WhatsApp message ID when announced

### TaskUpdate
WhatsApp messages sent by assigned users.
- Replies to task announcements
- Can be TEXT, IMAGE, VIDEO, AUDIO, or DOCUMENT
- Analyzed by AI to understand task status
- AI analysis stored as JSON
- Contains the WhatsApp message ID for tracking

### TaskAttachment
Files and media sent via WhatsApp.
- Linked to both task and task update
- Stores file metadata (name, type, size, MIME type)
- References storage URL (S3, Cloudinary, etc.)
- Tracks WhatsApp media ID

### Reminder
Configuration for task reminders.
- Linked to a task
- Sent to a specific conversation
- Can be ONCE, DAILY, WEEKLY, or CUSTOM frequency
- Tracks when last sent and when to send next
- Can be activated/deactivated

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

### Cascading Deletes
- When a Manager is deleted, all their projects, created users, and tasks are deleted
- When a Project is deleted, all its assigned users and tasks are deleted
- When a Task is deleted, all its updates, attachments, and reminders are deleted
- When a Conversation is deleted, all its members are removed

### Indexes
Optimized for common queries:
- Project lookups by manager
- User lookups by project
- Task lookups by project, user, status, and conversation
- Update lookups by task and timestamp
- Reminder lookups by next reminder time and active status

## Usage

### Migrations

```bash
# Create a new migration
pnpm prisma migrate dev --name description_of_changes

# Apply migrations in production
pnpm prisma migrate deploy

# Reset database (WARNING: deletes all data)
pnpm prisma migrate reset
```

### Prisma Studio

```bash
# Open Prisma Studio to view/edit data
pnpm prisma studio
```

### Generate Client

```bash
# Regenerate Prisma Client after schema changes
pnpm prisma generate
```

## Environment Variables

Required environment variables in `.env`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/whatsapp_task_manager?schema=public"
```

See `.env.example` for all required environment variables.
