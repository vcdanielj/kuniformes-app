"use client";

import { createContext, useContext } from "react";

export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "vendedor";
  active: boolean;
}

const UserContext = createContext<User | null>(null);

export function UserProvider({ children, user }: { children: React.ReactNode; user: User }) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useUser() {
  const context = useContext(UserContext);
  return context;
}
