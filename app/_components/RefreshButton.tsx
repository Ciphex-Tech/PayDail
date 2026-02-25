"use client";

type Props = {
  onClick: () => void;
  isRefreshing?: boolean;
  label?: string;
  refreshingLabel?: string;
  className?: string;
};

export default function RefreshButton({
  onClick,
  isRefreshing = false,
  label = "Refresh",
  refreshingLabel = "Refreshing...",
  className = "",
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isRefreshing}
      className={`flex items-center justify-center rounded-[12px] border border-white px-[12px] py-[10px] text-[14px] gap-2 font-normal ${
        isRefreshing ? "opacity-60" : ""
      } ${className}`}
    >
      <svg width="14" height="17" viewBox="0 0 14 17" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M11.5917 10.4167C11.1933 12.7775 9.13917 14.5833 6.66667 14.5833C3.91 14.5833 1.66667 12.34 1.66667 9.58333C1.66667 6.82667 3.91 4.58333 6.66667 4.58333H8.47667L6.73833 6.32167L7.91667 7.5L11.6667 3.75L7.91667 0L6.73833 1.17833L8.47667 2.91667H6.66667C4.89856 2.91667 3.20286 3.61905 1.95262 4.86929C0.702379 6.11953 0 7.81522 0 9.58333C0 11.3514 0.702379 13.0471 1.95262 14.2974C3.20286 15.5476 4.89856 16.25 6.66667 16.25C10.0658 16.25 12.865 13.7042 13.2758 10.4167H11.5917Z"
          fill="white"
        />
      </svg>
      <span>{isRefreshing ? refreshingLabel : label}</span>
    </button>
  );
}
