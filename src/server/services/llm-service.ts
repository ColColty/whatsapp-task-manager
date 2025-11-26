import { env } from "~/env";

/**
 * LLM Service for generating task-related messages
 * Uses OpenAI API to create engaging, context-aware messages for WhatsApp groups
 */

interface TaskContext {
  title: string;
  description?: string;
  assigneeName?: string;
  dueDate?: Date;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  projectName?: string;
}

interface GeneratedMessage {
  message: string;
  wasGenerated: boolean;
}

class LLMService {
  private apiKey: string | undefined;
  private baseUrl = "https://api.openai.com/v1";

  constructor() {
    this.apiKey = env.OPENAI_API_KEY;
  }

  /**
   * Check if LLM service is available (API key configured)
   */
  isAvailable(): boolean {
    return !!this.apiKey;
  }

  /**
   * Generate a task assignment message using LLM
   */
  async generateTaskMessage(context: TaskContext): Promise<GeneratedMessage> {
    if (!this.isAvailable()) {
      // Fall back to default template if no API key
      return {
        message: this.getDefaultTaskMessage(context),
        wasGenerated: false,
      };
    }

    try {
      const prompt = this.buildTaskMessagePrompt(context);
      const response = await this.callOpenAI(prompt);

      return {
        message: response,
        wasGenerated: true,
      };
    } catch (error) {
      console.error("LLM generation failed, using default template:", error);
      return {
        message: this.getDefaultTaskMessage(context),
        wasGenerated: false,
      };
    }
  }

  /**
   * Generate a task reminder message using LLM
   */
  async generateReminderMessage(
    context: TaskContext & { daysPastDue?: number },
  ): Promise<GeneratedMessage> {
    if (!this.isAvailable()) {
      return {
        message: this.getDefaultReminderMessage(context),
        wasGenerated: false,
      };
    }

    try {
      const prompt = this.buildReminderPrompt(context);
      const response = await this.callOpenAI(prompt);

      return {
        message: response,
        wasGenerated: true,
      };
    } catch (error) {
      console.error("LLM generation failed, using default template:", error);
      return {
        message: this.getDefaultReminderMessage(context),
        wasGenerated: false,
      };
    }
  }

  /**
   * Generate a status update message using LLM
   */
  async generateStatusUpdateMessage(
    context: TaskContext & { oldStatus: string; newStatus: string },
  ): Promise<GeneratedMessage> {
    if (!this.isAvailable()) {
      return {
        message: this.getDefaultStatusMessage(context),
        wasGenerated: false,
      };
    }

    try {
      const prompt = this.buildStatusUpdatePrompt(context);
      const response = await this.callOpenAI(prompt);

      return {
        message: response,
        wasGenerated: true,
      };
    } catch (error) {
      console.error("LLM generation failed, using default template:", error);
      return {
        message: this.getDefaultStatusMessage(context),
        wasGenerated: false,
      };
    }
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(prompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a helpful assistant that generates clear, friendly WhatsApp messages for task management in a work environment.

Guidelines:
- Keep messages concise but informative (suitable for WhatsApp)
- Use appropriate emojis to make messages visually appealing
- Be professional but friendly
- Include key task details naturally
- End with a clear call to action when appropriate
- Messages should feel personal, not robotic
- Do not use markdown formatting (no asterisks for bold, etc.)
- Keep messages under 500 characters when possible`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      choices: Array<{
        message: {
          content: string;
        };
      }>;
    };

    return data.choices[0]?.message?.content?.trim() ?? "";
  }

  /**
   * Build prompt for task assignment message
   */
  private buildTaskMessagePrompt(context: TaskContext): string {
    const parts = [
      `Generate a WhatsApp message to assign a new task.`,
      `\nTask title: ${context.title}`,
    ];

    if (context.description) {
      parts.push(`Description: ${context.description}`);
    }

    if (context.assigneeName) {
      parts.push(`Assigned to: ${context.assigneeName}`);
    }

    if (context.dueDate) {
      parts.push(`Due date: ${context.dueDate.toLocaleDateString()}`);
    }

    if (context.priority) {
      parts.push(`Priority: ${context.priority}`);
    }

    if (context.projectName) {
      parts.push(`Project: ${context.projectName}`);
    }

    parts.push(
      `\nThe message should inform the assignee about their new task and ask them to reply with updates or attach photos/videos of their progress.`,
    );

    return parts.join("\n");
  }

  /**
   * Build prompt for reminder message
   */
  private buildReminderPrompt(
    context: TaskContext & { daysPastDue?: number },
  ): string {
    const parts = [
      `Generate a friendly WhatsApp reminder message for an outstanding task.`,
      `\nTask title: ${context.title}`,
    ];

    if (context.assigneeName) {
      parts.push(`Assigned to: ${context.assigneeName}`);
    }

    if (context.daysPastDue && context.daysPastDue > 0) {
      parts.push(`Days overdue: ${context.daysPastDue}`);
    } else if (context.dueDate) {
      parts.push(`Due date: ${context.dueDate.toLocaleDateString()}`);
    }

    parts.push(
      `\nThe message should politely remind them about the task and ask for an update.`,
    );

    return parts.join("\n");
  }

  /**
   * Build prompt for status update message
   */
  private buildStatusUpdatePrompt(
    context: TaskContext & { oldStatus: string; newStatus: string },
  ): string {
    return `Generate a brief WhatsApp notification about a task status change.

Task title: ${context.title}
Previous status: ${context.oldStatus}
New status: ${context.newStatus}
${context.assigneeName ? `Assigned to: ${context.assigneeName}` : ""}

Keep it short and use an appropriate emoji for the status.`;
  }

  /**
   * Default task assignment message template
   */
  private getDefaultTaskMessage(context: TaskContext): string {
    const parts = [`📋 New Task: ${context.title}`];

    if (context.description) {
      parts.push(`\n${context.description}`);
    }

    if (context.assigneeName) {
      parts.push(`\n👤 Assigned to: ${context.assigneeName}`);
    }

    if (context.dueDate) {
      parts.push(`📅 Due: ${context.dueDate.toLocaleDateString()}`);
    }

    if (context.priority && context.priority !== "MEDIUM") {
      const priorityEmoji =
        context.priority === "URGENT"
          ? "🔴"
          : context.priority === "HIGH"
            ? "🟠"
            : "🟢";
      parts.push(`${priorityEmoji} Priority: ${context.priority}`);
    }

    parts.push(
      `\nReply to this message with updates or attach photos/videos of your progress!`,
    );

    return parts.join("\n");
  }

  /**
   * Default reminder message template
   */
  private getDefaultReminderMessage(
    context: TaskContext & { daysPastDue?: number },
  ): string {
    const assignee = context.assigneeName ?? "Team";
    const overdue =
      context.daysPastDue && context.daysPastDue > 0
        ? ` (${context.daysPastDue} days overdue)`
        : "";

    return `⏰ Reminder: ${assignee}, don't forget about the task "${context.title}"${overdue}!\n\nPlease provide an update when you can.`;
  }

  /**
   * Default status update message template
   */
  private getDefaultStatusMessage(
    context: TaskContext & { oldStatus: string; newStatus: string },
  ): string {
    const statusEmoji: Record<string, string> = {
      TODO: "⏳",
      IN_PROGRESS: "🔄",
      DONE: "✅",
      BLOCKED: "🚫",
      FEEDBACK_NEEDED: "💬",
    };

    const emoji = statusEmoji[context.newStatus] ?? "📋";
    return `${emoji} Task status updated: "${context.title}" is now ${context.newStatus}`;
  }
}

// Export singleton instance
export const llmService = new LLMService();
