import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Firebase
vi.mock('../services/firebase', () => {
  return {
    db: {},
    auth: {
      currentUser: { uid: 'test-user-id' },
      onAuthStateChanged: vi.fn(callback => {
        callback({ uid: 'test-user-id' });
        return vi.fn();
      }),
    },
    signInAnonymousUser: vi.fn(() => Promise.resolve({ uid: 'test-user-id' })),
  };
});
