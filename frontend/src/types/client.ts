export type Client = {
  id: string;
  name: string;
  contact?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  active: boolean;
};
