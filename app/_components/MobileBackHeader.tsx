"use client";

import { useRouter } from "next/navigation";

type Props = {
  title: string;
};

export default function MobileBackHeader({ title }: Props) {
  const router = useRouter();

  return (
    <div className="md:hidden">
      <div className="flex items-center gap-3 px-4 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex gap-2 items-center justify-center rounded-[10px] p-2 pl-0"
          aria-label="Go back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 18l-6-6 6-6" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[14px]">Back</span>
        </button>

        <div className="min-w-0">
          <p className="hidden text-[15px] font-semibold text-white truncate">{title}</p>
        </div>
      </div>
    </div>
  );
}
