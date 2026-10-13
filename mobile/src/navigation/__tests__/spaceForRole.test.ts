import { spaceForRole } from '../spaceForRole';

describe('aiguillage par rôle', () => {
  it("ouvre l'espace de chaque profil, quelle que soit la casse", () => {
    expect(spaceForRole('AGENT')).toBe('Agent');
    expect(spaceForRole('supervisor')).toBe('Supervisor');
    expect(spaceForRole(' Supervisor ')).toBe('Supervisor');
  });

  it("n'ouvre aucun espace mobile à l'administrateur ni à un rôle inconnu", () => {
    expect(spaceForRole('ADMIN')).toBe('AdminWebOnly');
    expect(spaceForRole('MANAGER')).toBe('AdminWebOnly');
    expect(spaceForRole(undefined)).toBe('AdminWebOnly');
  });
});
