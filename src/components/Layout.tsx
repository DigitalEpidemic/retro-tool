import { ReactNode } from 'react';
import { ClipboardList } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ClipboardList className="h-5 w-5 text-blue-600" />
            <h1 className="text-lg font-medium text-gray-800">Retro Tool</h1>
          </div>
          <nav className="flex space-x-4">
            {/* Navigation links will go here */}
          </nav>
        </div>
      </header>
      <main className="flex-1 w-full mx-auto py-6 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {children}
      </main>
      <footer className="bg-white border-t border-gray-200 py-3">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} Retro Tool. All rights reserved.
        </div>
      </footer>
    </div>
  );
} 