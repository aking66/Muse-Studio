import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error:
        'Legacy /api/generate/refine endpoint is deprecated. Use MCP Extensions (/mcp-extensions) or /api/generate/comfyui.',
      migration: '/mcp-extensions',
    },
    {
      status: 410,
      headers: {
        'x-muse-deprecated': 'true',
      },
    },
  );
}
