const resolveApiUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL && process.env.EXPO_PUBLIC_API_URL.trim().length > 0) {
    return process.env.EXPO_PUBLIC_API_URL.trim().replace(/\/$/, '');
  }
  // fallback to production backend (Render, migré depuis AWS)
  return 'https://madypro-fullstack.onrender.com';
};

export const env = {
  apiUrl: resolveApiUrl(),
};
