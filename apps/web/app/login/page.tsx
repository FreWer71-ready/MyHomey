import { Icon } from '@/components/Icon';
import { signIn } from './actions';

const MESSAGES: Record<string, string> = {
  sent: 'Om adressen är godkänd har en inloggningslänk skickats. Öppna den på den här enheten.',
  error: 'Något gick fel. Försök igen.',
  badlogin: 'Fel e-post eller lösenord.',
  ratelimit: 'För många inloggningsmejl just nu. Vänta en timme och försök igen.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <form action={signIn} className="flex w-full max-w-md flex-col gap-5 rounded-[32px] glass p-8">
        <span className="flex size-16 items-center justify-center rounded-[20px] bg-sun">
          <Icon name="logo" size={34} />
        </span>
        <h1 className="text-4xl font-extrabold tracking-tight">MyHomey</h1>
        <label className="flex flex-col gap-2 font-bold">
          E-post
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="min-h-14 rounded-2xl border-2 border-line px-4 text-lg font-semibold outline-none focus:border-fg"
          />
        </label>
        <label className="flex flex-col gap-2 font-bold">
          Lösenord
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            className="min-h-14 rounded-2xl border-2 border-line px-4 text-lg font-semibold outline-none focus:border-fg"
          />
          <span className="text-sm font-semibold text-dim">Lämna tomt för att få en inloggningslänk via e-post.</span>
        </label>
        <button type="submit" className="min-h-14 rounded-full bg-deep text-lg font-extrabold text-white">
          Logga in
        </button>
        {status && MESSAGES[status] && (
          <p role="status" className="rounded-2xl bg-ok-soft p-4 font-bold text-ok">
            {MESSAGES[status]}
          </p>
        )}
      </form>
    </main>
  );
}
