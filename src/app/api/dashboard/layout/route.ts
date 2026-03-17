import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApi } from '@/lib/api/handler';
import { prisma } from '@/lib/db/prisma';
import { apiSuccess } from '@/types/api';

export const GET = withApi(async (_request: NextRequest, { session }) => {
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { dashboardLayout: true },
  });

  return NextResponse.json(apiSuccess({ layout: user?.dashboardLayout ?? null }));
});

const tileSchema = z.object({
  id: z.string(),
  header: z.string(),
  col: z.number().int().positive(),
  row: z.number().int().positive(),
  colSpan: z.number().int().positive(),
  rowSpan: z.number().int().positive(),
  tileType: z.string(),
});

const bodySchema = z.object({
  layout: z.array(tileSchema).min(1).max(20),
});

export const POST = withApi(
  async (request: NextRequest, { session }) => {
    const body = await request.json();
    const { layout } = bodySchema.parse(body);

    await prisma.user.update({
      where: { id: session.userId },
      data: { dashboardLayout: layout },
    });

    return NextResponse.json(apiSuccess({ saved: true }));
  },
  { bodySchema },
);
