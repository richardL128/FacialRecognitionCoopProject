import { redirect } from 'next/navigation';

// TODO: Integrate your identity provider login flow
export default function LoginPage() {
  redirect('/dashboard' as const);
}
