import { useSession } from 'next-auth/react';
import Login from '../components/Login';
import Dashboard from '../components/Dashboard';

export default function Home() {
  const { data: session, status } = useSession();

  if (status === 'loading') return <div className="flex items-center justify-center min-h-screen bg-gray-50 text-gray-600 font-medium">Carregando painel...</div>;
  if (!session) return <Login />;
  
  return <Dashboard user={session.user} />;
}