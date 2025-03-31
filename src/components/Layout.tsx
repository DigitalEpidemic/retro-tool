import { ReactNode } from 'react';
import { ClipboardList } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ClipboardList className="h-6 w-6 text-indigo-600" />
            <h1 className="text-xl font-semibold text-gray-900">Retro Tool</h1>
          </div>
          <nav className="flex space-x-4">
            {/* Navigation links will go here */}
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
      <footer className="bg-white border-t border-gray-200 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} Retro Tool. All rights reserved.
        </div>
      </footer>
    </div>
  );
} 