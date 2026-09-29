import { renderHoneybackShareCard } from "@/features/honeyback/share-card";

// The card at an address that never changes, for the image a wave embeds.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  return renderHoneybackShareCard(id);
}
