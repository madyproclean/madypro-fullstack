import { translate } from '../index';
import { DICTIONARIES } from '../messages';

describe('traductions de l’espace agent', () => {
  it('remplace les variables et traduit selon la langue', () => {
    expect(translate('fr', 'home.hello', { name: 'Tino' })).toBe('Bonjour, Tino');
    expect(translate('en', 'home.hello', { name: 'Tino' })).toBe('Hello, Tino');
    expect(translate('es', 'mission.slideStart')).toBe('Desliza para empezar');
    expect(translate('pt', 'hours.leave', { days: 12 })).toBe('Férias pagas restantes: 12 dia(s)');
  });

  it('a toutes les clés dans chaque langue', () => {
    const keys = Object.keys(DICTIONARIES.fr);
    for (const lang of ['en', 'es', 'pt'] as const) {
      const missing = keys.filter((k) => !(k in DICTIONARIES[lang]));
      expect({ lang, missing }).toEqual({ lang, missing: [] });
    }
  });
});
