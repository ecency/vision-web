import { HONEYBACK_CARD_SIZE, renderHoneybackShareCard } from "@/features/honeyback/share-card";

export const alt = "Honeyback";
export const size = HONEYBACK_CARD_SIZE;
export const contentType = "image/png";

export default async function HoneybackShareImage({
  params
}: {
  params: Promise<{ id: string }>;
}): Promise<Response> {
  const { id } = await params;
  return renderHoneybackShareCard(id);
}
