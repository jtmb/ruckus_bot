"use client"; // Ensure this component is treated as a client component

import { usePathname } from 'next/navigation';
import Header from './../header/page.js';

export default function HeaderWrapper() {
    const pathname = usePathname();

    // Define the paths where the header should not be shown
    const hideHeaderPaths = ['/', '/createAccount'];

    return (
        <>
            {!hideHeaderPaths.includes(pathname) && <Header />}
        </>
    );
}
