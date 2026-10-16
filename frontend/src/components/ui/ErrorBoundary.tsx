import React from 'react';
import { reportError } from '../../services/errorReporting';

type State = { failed: boolean };

/** Affiche un message clair au lieu d'une page blanche, et remonte l'erreur au journal. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    reportError(error, 'affichage');
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ maxWidth: 560, margin: '15vh auto', padding: '0 16px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem' }}>Un problème est survenu</h1>
        <p>L’équipe technique a été prévenue. Rechargez la page pour continuer.</p>
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          Recharger la page
        </button>
      </div>
    );
  }
}
