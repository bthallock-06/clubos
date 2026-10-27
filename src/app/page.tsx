import { redirect } from "next/navigation";
import { currentViewer, homeFor } from "@/server/auth/session";

export default async function Root() {
  const viewer = await currentViewer();
  redirect(viewer ? homeFor(viewer.role) : "/login");
}
