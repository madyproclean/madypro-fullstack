import { Linking, Platform } from 'react-native';

const clean = (phone: string) => phone.replace(/[^\d+]/g, '');

/** Lance un appel ; rejette si l'appareil ne sait pas téléphoner (tablette Wi-Fi). */
export const callPhone = (phone: string) => Linking.openURL(`tel:${clean(phone)}`);

export const sendSms = (phone: string) => Linking.openURL(`sms:${clean(phone)}`);

/** Itinéraire vers une adresse (ou des coordonnées), dans l'application de cartes de l'appareil. */
export const openDirections = (address: string, latitude?: number | null, longitude?: number | null) => {
  const destination =
    latitude != null && longitude != null ? `${latitude},${longitude}` : encodeURIComponent(address);
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${destination}`
      : `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
  return Linking.openURL(url);
};

/** Durée en minutes → « 7 h 30 », « 45 min », « 0 h ». */
export const formatMinutes = (minutes: number) => {
  if (minutes <= 0) return '0 h';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
};
