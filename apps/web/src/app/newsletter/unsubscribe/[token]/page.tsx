import { Metadata } from "next";
import { UnsubscribePage } from "./_page";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false }
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <UnsubscribePage token={token} />;
}
