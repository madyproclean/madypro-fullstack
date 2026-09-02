export type Assignment = {
  id: string;
  userId: string;
  siteId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  user: {
    id: string;
    name: string;
    role: string;
  };
  site: {
    id: string;
    name: string;
    address: string;
  };
};
