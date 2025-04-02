import { ReactNode } from 'react';
import { ClipboardList } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="h-screen bg-white">
      <main className="h-full w-full mx-auto">
        {children}
      </main>
    </div>
  );
} 