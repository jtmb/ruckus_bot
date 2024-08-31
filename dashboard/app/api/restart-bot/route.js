// app/api/restart-bot/route.js

import { restartBot } from '../../components/api_bot_restart';
import { NextResponse } from 'next/server';

export async function POST() {
    const apiEndpoint = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';
    const result = await restartBot(apiEndpoint);
    return NextResponse.json(result);
}
