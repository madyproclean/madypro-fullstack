import React, { useEffect, useState } from 'react';
import { useAuthContext } from '../../context/AuthContext';
import { TeamPost } from '../../types/team';
import { listTeamPosts, createTeamPost, deleteTeamPost } from '../../services/api/team.api';
import { Button } from '../../components/ui/Button';
import { Textarea } from '../../components/ui/Textarea';
import { formatDateTime } from '../../utils/datetime';
import { Send, Trash2 } from 'lucide-react';

export const TeamFeedPage: React.FC = () => {
  const { token, user, notify } = useAuthContext();
  const [posts, setPosts] = useState<TeamPost[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);

  const load = () => {
    if (!token) return;
    setLoading(true);
    listTeamPosts(token)
      .then(setPosts)
      .catch((err) => notify(err instanceof Error ? err.message : 'Impossible de charger', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !message.trim()) return;
    setPosting(true);
    try {
      await createTeamPost(token, message.trim());
      setMessage('');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Publication impossible', 'error');
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    try {
      await deleteTeamPost(token, id);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Suppression impossible', 'error');
    }
  };

  return (
    <div>
      <div className="page-header">
        <span className="pill">Équipes</span>
        <h2>Fil d’actualité</h2>
        <p>Partagez une information avec toute l’équipe.</p>
      </div>

      <form className="form-card" onSubmit={handleSubmit} style={{ marginBottom: '1.5rem' }}>
        <Textarea
          id="teamPostMessage"
          label="Message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={3}
          placeholder="Bravo à toute l’équipe pour la semaine !"
        />
        <div className="form-actions">
          <Button type="submit" icon={Send} loading={posting} disabled={!message.trim()}>
            Publier
          </Button>
        </div>
      </form>

      <section className="panel">
        {loading ? (
          <p>Chargement...</p>
        ) : posts.length === 0 ? (
          <p className="card__meta">Aucune publication.</p>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {posts.map((post) => (
              <article key={post.id} className="settings-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <strong>
                      {post.author.firstName} {post.author.lastName}
                    </strong>
                    <span className="card__meta" style={{ marginLeft: '0.5rem' }}>
                      {formatDateTime(post.createdAt)}
                    </span>
                  </div>
                  {(post.authorId === user?.id || user?.role === 'ADMIN') && (
                    <Button type="button" variant="ghost" icon={Trash2} onClick={() => handleDelete(post.id)}>
                      Supprimer
                    </Button>
                  )}
                </div>
                <p style={{ marginTop: '0.5rem' }}>{post.message}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
