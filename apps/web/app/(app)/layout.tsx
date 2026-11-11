import { Nav } from '@/components/Nav';
import { LiveRefresh } from '@/components/LiveRefresh';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Nav />
      <LiveRefresh />
      <main className="flex min-w-0 grow flex-col gap-3 p-3 pb-28 md:p-4">{children}</main>
    </div>
  );
}
