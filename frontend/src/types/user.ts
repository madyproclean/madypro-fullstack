export type User = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  phone: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  active: boolean;
  twoFactorEnabled?: boolean;
  permissions?: string[];
};
