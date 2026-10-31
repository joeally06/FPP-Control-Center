'use client';

import { getProviders, signIn, getSession, type ClientSafeProvider } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignIn() {
  const [providers, setProviders] = useState<Record<string, ClientSafeProvider> | null>(null);
  const router = useRouter();

  useEffect(() => {
    const getProvidersData = async () => {
      const providers = await getProviders();
      setProviders(providers);
    };
    getProvidersData();

    // Check if already signed in
    const checkSession = async () => {
      const session = await getSession();
      if (session) {
        router.push('/');
      }
    };
    checkSession();
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
        <h1 className="text-2xl font-bold mb-6 text-center">Admin Sign In</h1>
        <p className="text-gray-600 mb-6 text-center">
          Sign in with your preferred provider to access admin controls.
        </p>
        {providers && Object.values(providers).map((provider) => (
          provider.id !== 'facebook' && (
            <button
              key={provider.name}
              onClick={() => signIn(provider.id)}
              className="w-full bg-blue-500 text-white py-2 px-4 rounded mb-3 hover:bg-blue-600"
            >
              Sign in with {provider.name}
            </button>
          )
        ))}
        <button
          onClick={() => router.push('/')}
          className="w-full bg-gray-500 text-white py-2 px-4 rounded hover:bg-gray-600"
        >
          Back to Standard View
        </button>
      </div>
    </div>
  );
}
