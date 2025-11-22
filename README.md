# Whatsapp task manager

## Problem

I want to keep track of the work it needs to be done in my garden as well as in my builds.
But we don't want to get people to download, create an account and manage a different service like Linear or Asana to track tasks.

## Solution

Would be great to use our main communication tool, Whatsapp, to get updates and send tasks to the corresponding people.
A new conversation or group would be created with each member, or you can create conversations with different members together, and a bot, will send and request updates.

The manager will be able to through a UI, or /task in the conversation, to add new tasks and assign them to each user.
The assigned user, will use that reminder message that was sent by the bot, to reply to it, and add videos, messages and so on, and they will be automatically stored and added to that task.

This will allow the manager to know if the task was done, and how it was done, or if there was some feedback from the user.
We would use a basic LLM to read the message and understand if the task was finished or if he's asking something, so we can change the status of the task.


The users would be able to use /todo, to get a list of all the tasks they need to do.
The manager will be able to control the reminders and how it's sent to the users, if it's in the conversation with everyone, or in a personal chat with the assignee.
