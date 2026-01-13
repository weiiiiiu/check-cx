import {NextResponse} from "next/server";

import {loadDashboardData} from "@/lib/core/dashboard-data";
import type {AvailabilityPeriod} from "@/lib/types";

export const revalidate = 0;
export const dynamic = "force-dynamic";

const VALID_PERIODS: AvailabilityPeriod[] = ["7d", "15d", "30d"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("trendPeriod");
  const trendPeriod = VALID_PERIODS.includes(period as AvailabilityPeriod)
    ? (period as AvailabilityPeriod)
    : undefined;

  const data = await loadDashboardData({
    refreshMode: "always",
    trendPeriod,
  });
  return NextResponse.json(data);
}
