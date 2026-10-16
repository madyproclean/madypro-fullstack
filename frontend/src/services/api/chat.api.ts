import { ChatMessage, ChatThreadSummary } from '../../types/chat';
import { apiFetch } from './client';

export async function listThreads(token: string) {
  return apiFetch<ChatThreadSummary[]>({ path: 'chat/threads', token });
}

export async function getThread(token: string, userId: string) {
  return apiFetch<ChatMessage[]>({ path: `chat/threads/${userId}`, token });
}

export async function sendMessage(token: string, userId: string, body: string) {
  return apiFetch<ChatMessage>({
    path: `chat/threads/${userId}/messages`,
    token,
    options: { method: 'POST', body: JSON.stringify({ body }) },
  });
}

export async function markThreadRead(token: string, userId: string) {
  return apiFetch<{ success: boolean }>({
    path: `chat/threads/${userId}/read`,
    token,
    options: { method: 'PATCH' },
  });
}
