import { useContext } from 'react';
import { FirebaseContext, defaultContextValue } from './FirebaseTypes';

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (context === defaultContextValue) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
}; 