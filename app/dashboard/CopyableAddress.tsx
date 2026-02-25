"use client";

import Image from "next/image";

export default function CopyableAddress({ address }: { address: string }) {
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(address);
      window.dispatchEvent(
        new CustomEvent("paydail:toast", {
          detail: { message: "Address copied" },
        }),
      );
    } catch {
      window.dispatchEvent(
        new CustomEvent("paydail:toast", {
          detail: { message: "Couldn't copy address" },
        }),
      );
    }
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <p className="text-[14px] text-white font-normal">{address}</p>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex items-center justify-center cursor-pointer"
        aria-label="Copy address"
      >
        <Image src="/images/copy.svg" alt="" width={16} height={16} />
      </button>
    </div>
  );
}
