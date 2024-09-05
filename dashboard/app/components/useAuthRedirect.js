// components/useAuthRedirect.js
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const useAuthRedirect = () => {
    const router = useRouter();

    useEffect(() => {
        const checkAuth = () => {
            const authenticated = localStorage.getItem('authenticated');
            if (authenticated !== 'true') {
                router.push('/'); // Redirect to home if not authenticated
            }
        };

        checkAuth();
    }, [router]);
};

export default useAuthRedirect;
