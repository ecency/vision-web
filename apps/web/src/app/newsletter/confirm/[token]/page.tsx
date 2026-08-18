import { Metadata } from "next";
import { ConfirmPage } from "./_page";

export const metadata: Metadata = {
  title: "Confirm subscription",
  robots: { index: false, follow: false }
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ConfirmPage token={token} />;
}
