import { ReactNode } from 'react';
import { ClipboardList } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <main className="flex-1 w-full mx-auto overflow-hidden">
        {children}
      </main>
    </div>
  );
} 