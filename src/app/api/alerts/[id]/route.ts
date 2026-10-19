import { NextResponse } from "next/server";
import { getAlertById, updateAlert } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const alert = await getAlertById(id);
  if (!alert) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, alert });
}

/** Pause / resume an alert. Deletion is a soft-disable (we keep the history). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const alert = await getAlertById(id);
  if (!alert) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  let action = "";
  try {
    const body = await req.json();
    action = String(body?.action ?? "");
  } catch {
    action = new URL(req.url).searchParams.get("action") ?? "";
  }

  let status = alert.status;
  if (action === "pause") status = "PAUSED";
  else if (action === "resume") status = "ARMED";
  else if (action === "disable") status = "DISABLED";
  else return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });

  const updated = await updateAlert(id, { status });
  return NextResponse.json({ ok: true, status: updated?.status });
}

/** Soft-disable — never destroy alert history. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const alert = await getAlertById(id);
  if (!alert) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  await updateAlert(id, { status: "DISABLED" });
  return NextResponse.json({ ok: true, status: "DISABLED" });
}
