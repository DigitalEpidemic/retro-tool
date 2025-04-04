import { createContext, useContext, useEffect, useState } from "react";
import { auth, signInAnonymousUser } from "../services/firebase";
import { User } from "firebase/auth";

export interface FirebaseContextType {
  user: User | null;
  loading: boolean;
  error: Error | null;
}

// Define the default value separately for reference comparison
const defaultFirebaseContextValue: FirebaseContextType = {
  user: null,
  loading: true,
  error: null,
};

const FirebaseContext = createContext<FirebaseContextType>(
  defaultFirebaseContextValue
);

export const FirebaseProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
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
      signInAnonymousUser().catch((err) => {
        setError(err);
        setLoading(false); // Set loading false on sign-in error too
      });
    }

    return () => unsubscribe();
  }, []);

  return (
    <FirebaseContext.Provider value={{ user, loading, error }}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  // Check if the context is the default value object, meaning no Provider was found.
  if (context === defaultFirebaseContextValue) {
    throw new Error("useFirebase must be used within a FirebaseProvider");
  }
  return context;
};
