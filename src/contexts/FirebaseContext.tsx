import { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, signInAnonymousUser } from '../services/firebase';
import { User } from 'firebase/auth';

interface FirebaseContextType {
  user: User | null;
  loading: boolean;
  error: Error | null;
}

const FirebaseContext = createContext<FirebaseContextType>({
  user: null,
  loading: true,
  error: null
});

export const FirebaseProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(
      (user) => {
        setUser(user);
        setLoading(false);
      },
      (error) => {
        setError(error);
        setLoading(false);
      }
    );

    // Auto sign-in anonymously
    if (!auth.currentUser) {
      signInAnonymousUser().catch(setError);
    }

    return () => unsubscribe();
  }, []);

  return (
    <FirebaseContext.Provider value={{ user, loading, error }}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => useContext(FirebaseContext); 