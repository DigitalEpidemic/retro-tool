import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { ReactNode, useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { ExtendedUser, FirebaseContext } from './FirebaseTypes';

export const FirebaseProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<ExtendedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Function to update user display name programmatically
  const updateUserDisplayName = (name: string) => {
    if (user) {
      const updatedUser = {
        ...user,
        displayName: name,
      } as ExtendedUser;
      setUser(updatedUser);
    }
  };

  useEffect(() => {
    const auth = getAuth();
    setLoading(true);

    // First, set up the auth state listener
    const unsubscribe = onAuthStateChanged(auth, async firebaseUser => {
      try {
        if (firebaseUser) {
          // Fetch the user's stored data from Firestore
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));

          // Create an extended user object with the stored name if available
          const extendedUser = {
            ...firebaseUser,
            // Override displayName with the name from Firestore if available
            displayName:
              userDoc.exists() && userDoc.data()?.name
                ? userDoc.data().name
                : firebaseUser.displayName || 'Anonymous User',
          } as ExtendedUser;

          setUser(extendedUser);
        } else {
          // No user - attempt anonymous sign-in
          try {
            await signInAnonymously(auth);
            // The onAuthStateChanged listener will catch the result
          } catch (signInError) {
            console.error('Anonymous sign-in failed:', signInError);
            setError(signInError as Error);
            setUser(null);
          }
        }
      } catch (err) {
        console.error('Error in auth state change handler:', err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    });

    // Clean up the listener
    return () => {
      // Make sure unsubscribe is a function before calling it
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  return (
    <FirebaseContext.Provider value={{ user, loading, error, updateUserDisplayName }}>
      {children}
    </FirebaseContext.Provider>
  );
};

// Hook moved to useFirebase.ts file
