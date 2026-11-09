import { HelpCircleIcon } from "@hugeicons/core-free-icons";
import { Icon } from "../tobin/Icon.tsx";

/** A fixed square tile that opens the documentation. It does not imply an assistant. It is its own landmark so axe finds no content outside one. */
export function HelpTile() {
  return (
    <aside aria-label="Help" className="fixed bottom-4 right-4 z-10">
      <a
        href="https://docs.tobinprotocol.xyz"
        target="_blank"
        rel="noreferrer noopener"
        aria-label="Documentation (opens in a new tab)"
        className="flex size-12 items-center justify-center bg-ink text-on-button hover:bg-ink-soft max-md:size-11"
      >
        <Icon icon={HelpCircleIcon} size={24} />
      </a>
    </aside>
  );
}
