import '@testing-library/jest-dom';
import { vi } from 'vitest';
import React from 'react';

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

// Mock Lucide React icons
vi.mock('lucide-react', () => {
  const mockIcon = (name: string) =>
    vi.fn().mockImplementation((props: React.SVGProps<SVGSVGElement>) =>
      React.createElement(
        'div',
        {
          'data-testid': `${name.toLowerCase()}-icon`,
          ...props,
        },
        name
      )
    );

  const icons = [
    'Plus',
    'X',
    'Check',
    'Trash',
    'Trash2',
    'Pencil',
    'Edit2',
    'Pen',
    'ChevronDown',
    'ChevronUp',
    'Menu',
    'ArrowUpDown',
    'MoreVertical',
    'EllipsisVertical',
    'Users',
    'TrendingUp',
    'Share2',
    'Settings',
    'Play',
    'Pause',
    'RotateCcw',
    'Download',
    'AlertCircle',
    'Eye',
    'EyeOff',
    'ThumbsUp',
    'ThumbsDown',
    'Copy',
    'Send',
    'Clock',
    'Timer',
    'Github',
    'Twitter',
    'Mail',
  ];

  const mockedIcons = Object.fromEntries(icons.map(icon => [icon, mockIcon(icon)]));

  return {
    __esModule: true,
    ...mockedIcons,
  };
});
