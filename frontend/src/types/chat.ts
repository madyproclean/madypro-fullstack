export type ChatMessage = {
  id: string;
  threadUserId: string;
  senderId: string;
  body: string;
  createdAt: string;
  readAt?: string;
};

export type ChatThreadSummary = {
  agent: { id: string; name: string };
  lastMessage: ChatMessage;
  unreadCount: number;
};
