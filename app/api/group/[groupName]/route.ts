import {NextResponse} from "next/server";
import {loadGroupDashboardData} from "@/lib/core/group-data";
import type {AvailabilityPeriod} from "@/lib/types";

interface RouteContext {
  params: Promise<{ groupName: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { groupName } = await context.params;
  const decodedGroupName = decodeURIComponent(groupName);

  const { searchParams } = new URL(_request.url);
  const period = searchParams.get("trendPeriod");
  const trendPeriod = (["7d", "15d", "30d"] as AvailabilityPeriod[]).includes(
    period as AvailabilityPeriod
  )
    ? (period as AvailabilityPeriod)
    : undefined;

  const data = await loadGroupDashboardData(decodedGroupName, {
    refreshMode: "always",
    trendPeriod,
  });

  if (!data) {
    return NextResponse.json(
      { error: "分组不存在或没有配置" },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}
