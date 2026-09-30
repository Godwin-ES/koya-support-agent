import Link from "next/link";
import { SearchX } from "lucide-react";
import { PRIMARY_ACTION, SECONDARY_ACTION, StatusPage } from "@/components/errors/status-page";

/** Unknown pages, and a conversation that isn't yours or doesn't exist (`/history/<id>`). */
export default function NotFound() {
  return (
    <StatusPage icon={SearchX} title="We couldn't find that page" message="It may have moved, or the link isn't quite right. Conversations only open for the account that had them.">
      <Link href="/" className={PRIMARY_ACTION}>
        Back to support
      </Link>
      <Link href="/history" className={SECONDARY_ACTION}>
        Your conversations
      </Link>
    </StatusPage>
  );
}
