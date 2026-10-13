import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/config/theme';
import { useAuthContext } from '@/context/AuthContext';
import { getChatThread, markChatRead, sendChatMessage } from '@/services/api/supervision.api';
import { ChatMessage } from '@/types/supervision';
import { formatClock, formatDayShort, toISODate } from './format';
import { ActionButton } from './DetailBlocks';

const REFRESH_MS = 10_000;
const MAX_LENGTH = 2000;

type Props = {
  agentId: string;
  agentName: string;
  /** Appelé après lecture ou envoi, pour mettre à jour la liste des discussions. */
  onChanged: () => void;
  onOpenFile: (agentId: string) => void;
};

/**
 * Discussion avec un agent : messages de l'agent à gauche, ceux de l'encadrement à droite
 * (« Vous » pour le superviseur connecté). Rafraîchie toutes les 10 secondes.
 */
export const ChatConversation: React.FC<Props> = ({ agentId, agentName, onChanged, onOpenFile }) => {
  const { token, user } = useAuthContext();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const lastSeen = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const next = await getChatThread(token, agentId);
      setMessages(next);
      setError(null);
      // Marque lus les nouveaux messages de l'agent dès qu'ils s'affichent.
      const unread = next.some((m) => m.senderId === agentId && !m.readAt);
      const last = next[next.length - 1]?.id ?? null;
      if (unread) {
        await markChatRead(token, agentId).catch(() => undefined);
        onChanged();
      }
      if (last !== lastSeen.current) {
        lastSeen.current = last;
        requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger la discussion.');
    }
  }, [token, agentId, onChanged]);

  useEffect(() => {
    setMessages(null);
    setDraft('');
    lastSeen.current = null;
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const send = async () => {
    const body = draft.trim();
    if (!token || !body || sending) return;
    setSending(true);
    try {
      await sendChatMessage(token, agentId, body);
      setDraft('');
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Le message n'a pas pu être envoyé.");
    } finally {
      setSending(false);
    }
  };

  let previousDay = '';

  return (
    <KeyboardAvoidingView style={styles.card} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {agentName}
        </Text>
        <ActionButton label="Fiche" icon="person-outline" onPress={() => onOpenFile(agentId)} />
      </View>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.messages}>
        {messages === null ? <ActivityIndicator color={theme.colors.primary} /> : null}
        {messages?.length === 0 ? (
          <Text style={styles.empty}>Aucun message pour l'instant. Écrivez le premier ci-dessous.</Text>
        ) : null}
        {messages?.map((m) => {
          const day = toISODate(new Date(m.createdAt));
          const showDay = day !== previousDay;
          previousDay = day;
          const fromAgent = m.senderId === agentId;
          const author = fromAgent ? agentName : m.senderId === user?.id ? 'Vous' : 'Encadrement';
          return (
            <View key={m.id}>
              {showDay ? <Text style={styles.day}>{formatDayShort(day)}</Text> : null}
              <View style={[styles.bubble, fromAgent ? styles.bubbleAgent : styles.bubbleMine]}>
                <Text selectable style={[styles.body, !fromAgent && { color: '#fff' }]}>
                  {m.body}
                </Text>
                <Text style={[styles.meta, !fromAgent && { color: '#DCE8F5' }]}>
                  {author} · {formatClock(m.createdAt)}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={`Écrire à ${agentName}`}
          placeholderTextColor={theme.colors.muted}
          accessibilityLabel={`Message à ${agentName}`}
          multiline
          maxLength={MAX_LENGTH}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Envoyer"
          accessibilityState={{ disabled: !draft.trim() || sending }}
          disabled={!draft.trim() || sending}
          onPress={send}
          style={({ pressed }) => [styles.send, (!draft.trim() || sending) && { opacity: 0.45 }, pressed && { opacity: 0.75 }]}
        >
          {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={20} color="#fff" />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: theme.colors.shell,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: { flex: 1, fontFamily: theme.fonts.display, fontSize: 22, color: theme.colors.ink },
  messages: { padding: 16, gap: 8 },
  empty: { fontFamily: theme.fonts.body, fontSize: 16, color: theme.colors.muted, textAlign: 'center', paddingVertical: 24 },
  day: { fontFamily: theme.fonts.bodyMedium, fontSize: 13, color: theme.colors.muted, textAlign: 'center', marginVertical: 8 },
  bubble: { maxWidth: '78%', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16, gap: 4 },
  bubbleAgent: { alignSelf: 'flex-start', backgroundColor: theme.colors.cream, borderBottomLeftRadius: 4 },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: theme.colors.primaryDark, borderBottomRightRadius: 4 },
  body: { fontFamily: theme.fonts.body, fontSize: 16, color: theme.colors.ink, lineHeight: 22 },
  meta: { fontFamily: theme.fonts.body, fontSize: 12, color: theme.colors.muted },
  error: { fontFamily: theme.fonts.bodyMedium, fontSize: 15, color: theme.colors.status.absent, paddingHorizontal: 16 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 140,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    fontFamily: theme.fonts.body,
    fontSize: 16,
    color: theme.colors.ink,
  },
  send: {
    width: 52,
    height: 48,
    borderRadius: 14,
    backgroundColor: theme.colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
