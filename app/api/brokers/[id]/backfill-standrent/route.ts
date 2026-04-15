import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getWeeksInMonth, formatWeekRange } from '@/lib/weeks';

/**
 * POST /api/brokers/[id]/backfill-standrent
 * Generates missing stand rent transactions backwards from start of year (or broker startDate if later).
 * Skips months that already have stand rent, only creates for missing weeks.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const broker = await prisma.broker.findUnique({
      where: { id: params.id },
      include: { vehicles: { where: { isActive: true } } },
    });
    if (!broker) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear  = now.getFullYear();

    // Start from Jan of current year, or broker startDate if later
    const brokerStart = new Date(broker.startDate);
    const startMonth = brokerStart.getFullYear() === currentYear
      ? Math.max(brokerStart.getMonth() + 1, 1)
      : brokerStart.getFullYear() < currentYear ? 1 : currentMonth; // if future year, skip
    const startYear = currentYear;

    if (brokerStart.getFullYear() > currentYear) {
      return NextResponse.json({ message: 'Broker starts in the future, nothing to backfill', created: 0 });
    }

    const vehicleCount = broker.vehicles.length || 1;
    const rate = broker.standRentAmount;
    let totalCreated = 0;
    const details: string[] = [];

    // Iterate through each month from startMonth to currentMonth
    for (let m = startMonth; m <= currentMonth; m++) {
      const maxWeeks = getWeeksInMonth(m, startYear);

      // For the current month, only go up to the current week
      // For past months, generate all weeks
      let maxWeekToGen = maxWeeks;
      if (m === currentMonth) {
        // Calculate current week number roughly
        const dayOfMonth = now.getDate();
        maxWeekToGen = Math.min(Math.ceil(dayOfMonth / 7), maxWeeks);
      }

      // Count existing non-void stand rent for this month
      const existingCount = await prisma.brokerTransaction.count({
        where: { brokerId: params.id, type: 'STAND_RENT', month: m, year: startYear, status: { not: 'VOID' } },
      });

      if (existingCount >= maxWeekToGen) continue; // Already fully generated

      // Generate missing weeks
      for (let w = existingCount + 1; w <= maxWeekToGen; w++) {
        const weekLabel = formatWeekRange(w, m, startYear);
        await prisma.brokerTransaction.create({
          data: {
            brokerId:    params.id,
            type:        'STAND_RENT',
            amount:      rate * vehicleCount,
            description: `${weekLabel} (${vehicleCount} cab${vehicleCount !== 1 ? 's' : ''} × $${rate})`,
            month:       m,
            year:        startYear,
            status:      'PENDING',
          },
        });
        totalCreated++;
      }
      if (existingCount < maxWeekToGen) {
        details.push(`${['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m]}: ${maxWeekToGen - existingCount} weeks`);
      }
    }

    return NextResponse.json({
      message: totalCreated > 0
        ? `Backfilled ${totalCreated} stand rent transactions`
        : 'All stand rent already up to date',
      created: totalCreated,
      details,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
