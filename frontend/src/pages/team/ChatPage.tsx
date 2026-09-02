import React, { useEffect, useState } from 'react';
import { useAuthContext } from '../../context/AuthContext';
import { ChatMessage, ChatThreadSummary } from '../../types/chat';
import { listThreads, getThread, sendMessage, markThreadRead } from '../../services/api/chat.api';
import { Button } from '../../components/ui/Button';
import { formatDateTime } from '../../utils/datetime';
import { Send } from 'lucide-react';

export const ChatPage: React.FC = () => {
  const { token, notify } = useAuthContext();
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const loadThreads = () => {
    if (!token) return;
    listThreads(token).then(setThreads).catch(() => {});
  };

  useEffect(loadThreads, [token]);

  const openThread = (agentId: string) => {
    if (!token) return;
    setSelectedAgentId(agentId);
    getThread(token, agentId)
      .then(setMessages)
      .catch((err) => notify(err instanceof Error ? err.message : 'Impossible de charger', 'error'));
    markThreadRead(token, agentId)
      .then(loadThreads)
      .catch(() => {});
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !selectedAgentId || !draft.trim()) return;
    setSending(true);
    try {
      const message = await sendMessage(token, selectedAgentId, draft.trim());
      setMessages((prev) => [...prev, message]);
      setDraft('');
      loadThreads();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Envoi impossible', 'error');
    } finally {
      setSending(false);
    }
  };

  const selectedAgent = threads.find((t) => t.agent.id === selectedAgentId)?.agent;

  return (
    <div>
      <div className="page-header">
        <span className="pill">Équipes</span>
        <h2>Messages</h2>
        <p>Échangez directement avec vos agents.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1rem', minHeight: '480px' }}>
        <section className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          {threads.length === 0 ? (
            <p className="card__meta" style={{ padding: '1rem' }}>
              Aucune conversation.
            </p>
          ) : (
            <div>
              {threads.map((thread) => (
                <div
                  key={thread.agent.id}
                  onClick={() => openThread(thread.agent.id)}
                  style={{
                    padding: '0.75rem 1rem',
                    borderBottom: '1px solid var(--color-border)',
                    cursor: 'pointer',
                    background: selectedAgentId === thread.agent.id ? 'var(--color-bg)' : 'transparent',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <strong>{thread.agent.name}</strong>
                    <p className="card__meta" style={{ margin: 0, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {thread.lastMessage.body}
                    </p>
                  </div>
                  {thread.unreadCount > 0 && (
                    <span
                      style={{
                        background: '#dc2626',
                        color: '#fff',
                        borderRadius: '999px',
                        fontSize: '0.7rem',
                        padding: '0.15rem 0.5rem',
                      }}
                    >
                      {thread.unreadCount}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
          {!selectedAgentId ? (
            <p className="card__meta">Sélectionnez une conversation.</p>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>{selectedAgent?.name}</h3>
              <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
                {messages.map((message) => {
                  const isMine = message.senderId !== selectedAgentId;
                  return (
                    <div
                      key={message.id}
                      style={{
                        alignSelf: isMine ? 'flex-end' : 'flex-start',
                        background: isMine ? 'var(--color-accent)' : 'var(--color-mist)',
                        color: isMine ? '#fff' : 'inherit',
                        borderRadius: '12px',
                        padding: '0.5rem 0.75rem',
                        maxWidth: '70%',
                      }}
                    >
                      <p style={{ margin: 0 }}>{message.body}</p>
                      <small style={{ opacity: 0.7 }}>{formatDateTime(message.createdAt)}</small>
                    </div>
                  );
                })}
                {messages.length === 0 && <p className="card__meta">Aucun message.</p>}
              </div>
              <form onSubmit={handleSend} style={{ display: 'flex', gap: '0.5rem' }}>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Votre message..."
                  rows={2}
                  style={{ flex: 1 }}
                />
                <Button type="submit" icon={Send} disabled={sending || !draft.trim()}>
                  Envoyer
                </Button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
};
