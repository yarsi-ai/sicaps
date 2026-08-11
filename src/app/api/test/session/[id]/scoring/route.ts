import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { errorResponse, successResponse } from '@/lib/api/response';
import { AppError } from '@/lib/errors';
import { getSessionScoring } from '@/services/testing.service';

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json(errorResponse('VALIDATION_ERROR', 'Invalid session ID'), {
      status: 400,
    });
  }

  try {
    const data = await getSessionScoring(parsed.data.id);
    return NextResponse.json(successResponse(data));
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(errorResponse(err.code, err.message), { status: err.statusCode });
    }
    throw err;
  }
}
