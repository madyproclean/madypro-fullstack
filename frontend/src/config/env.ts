const resolveMapboxToken = () =>
  import.meta.env.VITE_MAPBOX_TOKEN ||
  import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ||
  import.meta.env.VITE_PUBLIC_MAPBOX_TOKEN ||
  import.meta.env.VITE_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  'pk.eyJ1IjoibWF4aW1hbjgxIiwiYSI6ImNrdWVha3preDFpanEyc2w5ZjM1aGN6Y20ifQ.gVSeCycZh83WmNxhned2cg';

export const env = {
  apiUrl: import.meta.env.VITE_API_URL ?? 'https://api.madyproclean.com',
  mapboxToken: resolveMapboxToken(),
};
