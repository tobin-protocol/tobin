import Image from "next/image";

// A screenshot in a neutral window frame. The screenshots are generated from the web console's own browser
// journeys on throwaway demonstration data (fictional participants), not mock-ups. See public/img/README.md.
export function Window({
  src,
  alt,
  width,
  height,
  title = "Tobin Console · local sandbox",
  priority = false,
  className = "",
  imageClassName = "",
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  title?: string;
  priority?: boolean;
  className?: string;
  imageClassName?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[14px] border border-white/10 bg-[#121212] shadow-[0_30px_80px_-30px_rgb(0_0_0/0.45)] ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5" aria-hidden="true">
        <span className="size-2.5 rounded-full bg-white/20" />
        <span className="size-2.5 rounded-full bg-white/20" />
        <span className="size-2.5 rounded-full bg-white/20" />
        <span className="ml-3 truncate font-label text-xs text-white/45">{title}</span>
      </div>
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        sizes="(min-width: 1200px) 1100px, 100vw"
        className={`h-auto w-full ${imageClassName}`}
      />
    </div>
  );
}
