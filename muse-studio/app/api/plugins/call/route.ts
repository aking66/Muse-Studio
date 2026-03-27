import { NextResponse } from 'next/server';
import { callEnabledPluginsForCapability } from '@/lib/actions/plugins';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      capability: string;
      pluginId?: string;
      input: unknown;
      projectId?: string;
    };

    if (!body?.capability) {
      return NextResponse.json({ ok: false, error: 'Missing "capability".' }, { status: 400 });
    }

    const res = await callEnabledPluginsForCapability({
      capability: body.capability,
      pluginId: body.pluginId,
      input: body.input,
      projectId: body.projectId,
    });

    if (!res.ok) {
      return NextResponse.json(res, { status: 502 });
    }

    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

