import { NextResponse } from 'next/server';
import { listEnabledPluginsForCapability } from '@/lib/actions/plugins';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const capability = (url.searchParams.get('capability') ?? '').trim();
    if (!capability) {
      return NextResponse.json({ error: 'Missing capability query param' }, { status: 400 });
    }
    const providers = await listEnabledPluginsForCapability(capability);
    return NextResponse.json({ providers });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 },
    );
  }
}

