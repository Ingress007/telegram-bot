import type { Aria2Config } from './aria2.js';

export interface UserData {
  userId: number;
  username?: string;
  aria2Config?: Aria2Config;
  createdAt: string;
  updatedAt: string;
}

export interface UsersDatabase {
  users: Record<string, UserData>;
}
