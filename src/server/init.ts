/**
 * Server initialization
 * This file initializes services when the server starts
 */
import { messageHandler } from "./services/message-handler";

let initialized = false;

export async function initializeServer() {
  if (initialized) {
    console.log("Server already initialized");
    return;
  }

  try {
    console.log("Initializing WhatsApp Task Manager server...");

    // Start listening for incoming WhatsApp messages
    await messageHandler.startListening();

    initialized = true;
    console.log("✅ WhatsApp Task Manager server initialized successfully");
  } catch (error) {
    console.error("❌ Failed to initialize server:", error);
    throw error;
  }
}

// Auto-initialize when this module is imported
if (process.env.NODE_ENV !== "test") {
  initializeServer().catch(console.error);
}
