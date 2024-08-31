import { fetchBotStatus } from '../../components/api_bot_status';
import { NextResponse } from 'next/server';

export async function GET() {
    const apiEndpoint = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';
    try {
        const result = await fetchBotStatus(apiEndpoint);
        console.log('Bot status result:', result); // Debugging line
        return NextResponse.json(result);
    } catch (error) {
        console.error('Error fetching bot status:', error);
        return NextResponse.json({
            botName: '',
            isBotUp: false,
            guilds: []
        });
    }
}
