// components/useAuthRedirect.js
// SECONDARY session check inside client views only. Protected pages validate the
// request cookie on the server before rendering; this hook merely reacts to a
// session that expires while a view is open (FIX-031). It is never the access gate.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const useAuthRedirect = () => {
    const router = useRouter();
    const [user, setUser] = useState(null);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/session', { cache: 'no-store' })
            .then(async (res) => {
                if (cancelled) return;
                if (res.ok) {
                    setUser((await res.json()).user);
                } else if (res.status === 401) {
                    // Invalid/expired session: a real auth failure, so leave the app.
                    router.push('/');
                }
                // 502 means the API is down, not that the session is invalid.
                // Keep the current view; the server gate re-checks on the next request.
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [router]);

    return user;
};

export default useAuthRedirect;
