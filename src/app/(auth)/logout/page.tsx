import { redirect } from 'next/navigation';

// TODO: Integrate your identity provider logout flow
export default function LogoutPage() {
  redirect('/login' as const);
}
