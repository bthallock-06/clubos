import { NextResponse } from "next/server";
import { todayIn } from "@/lib/dates";
import { currentViewer } from "@/server/auth/session";
import { journalForExport } from "@/server/domain/ledger";
import { resolve } from "@/server/integrations/registry";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Director only. Sends the period's journal through the club's accounting adapter. */
export async function GET(request: Request) {
  const viewer = await currentViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (viewer.role !== "director") return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const url = new URL(request.url);
  const today = todayIn(viewer.ctx.timezone);
  const from = url.searchParams.get("from") ?? `${today.slice(0, 4)}-01-01`;
  const to = url.searchParams.get("to") ?? today;
  if (!ISO.test(from) || !ISO.test(to)) {
    return NextResponse.json({ error: "from and to must be YYYY-MM-DD." }, { status: 400 });
  }

  const rows = await journalForExport(viewer.ctx, { from, to });
  const { adapter } = await resolve(viewer.ctx, "accounting");
  const file = await adapter.exportJournal(rows, { from, to });
  return new NextResponse(file.body, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
    },
  });
}
