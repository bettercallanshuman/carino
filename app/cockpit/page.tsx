'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLibraryStore } from '@/stores/libraryStore';
import { useAuthStore } from '@/stores/authStore';

export default function CockpitRedirect() {
  const router = useRouter();
  const setIsCockpitModalOpen = useLibraryStore((state) => state.setIsCockpitModalOpen);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const isLoading = useAuthStore((state) => state.isLoading);

  useEffect(() => {
    if (isLoading) return;
    if (isAdmin) {
      setIsCockpitModalOpen(true);
      router.replace('/');
    } else {
      router.replace('/?error=forbidden_admin_only');
    }
  }, [router, setIsCockpitModalOpen, isAdmin, isLoading]);

  return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#8E8E93', backgroundColor: '#000000', minHeight: '100vh' }}>
      Verifying administrator access...
    </div>
  );
}
