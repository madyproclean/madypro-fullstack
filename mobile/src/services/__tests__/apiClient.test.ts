import NetInfo from '@react-native-community/netinfo';
import { apiFetch, ApiError, isServerReachable, NetworkError } from '../api/client';

jest.mock('../../config/env', () => ({ env: { apiUrl: 'http://api.test' } }));

describe('client API hors ligne', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true });
  });

  it("refuse une action sans réseau sans rien envoyer", async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: false });
    await expect(
      apiFetch({ path: '/absences/1/status', token: 't', options: { method: 'PATCH', body: '{}' } }),
    ).rejects.toThrow("rien n'a été envoyé");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signale une coupure par une NetworkError (pas une ApiError)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const error = await apiFetch({ path: '/supervision/today', token: 't' }).catch((e) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect(error).not.toBeInstanceOf(ApiError);
  });

  it("garde le refus du serveur sous forme d'ApiError", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => JSON.stringify({ message: "Vous n'avez pas la charge de ce site" }),
    });
    const error = (await apiFetch({ path: '/supervision/sites/z', token: 't' }).catch((e) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(403);
  });

  it("passe hors ligne quand le serveur est injoignable, et revient à la première réponse", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await apiFetch({ path: '/supervision/today', token: 't' }).catch(() => undefined);
    expect(isServerReachable()).toBe(false);

    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: async () => '{}', json: async () => ({}) });
    await apiFetch({ path: '/supervision/today', token: 't' }).catch(() => undefined);
    expect(isServerReachable()).toBe(true);
  });
});
