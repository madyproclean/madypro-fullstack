import { API_BASE_URL } from '../services/api/client';

export async function openPdfInNewTab(token: string, path: string) {
  // Ouvre l'onglet de façon synchrone (dans le même tick que le clic utilisateur) pour
  // éviter que le popup-blocker du navigateur ne bloque silencieusement window.open()
  // une fois qu'on est passé par un await — l'onglet est ensuite redirigé vers le blob PDF.
  const tab = window.open('', '_blank');
  const base = API_BASE_URL.replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/${path.replace(/^\//, '')}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error('Impossible de générer le PDF');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (tab) {
      tab.location.href = url;
    } else {
      window.open(url, '_blank');
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    tab?.close();
    throw err;
  }
}
