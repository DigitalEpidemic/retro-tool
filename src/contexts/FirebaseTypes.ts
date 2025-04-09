import { User as FirebaseUser } from 'firebase/auth';
import { createContext } from 'react';

// Extended User type that includes displayName convenience property
export interface ExtendedUser extends FirebaseUser {
  displayName: string | null; // Make sure displayName is part of the interface
}

export interface FirebaseContextType {
  user: ExtendedUser | null;
  loading: boolean;
  error: Error | null;
  updateUserDisplayName?: (name: string) => void;
}

// Default context value
export const defaultContextValue: FirebaseContextType = {
  user: null,
  loading: true,
  error: null,
};

// Create context
export const FirebaseContext = createContext<FirebaseContextType>(defaultContextValue); 