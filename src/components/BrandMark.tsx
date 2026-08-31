"use client";

export default function BrandMark({
  size,
  className = "",
}: {
  size: number;
  className?: string;
}) {
  return (
    <span className={`brand-mark ${className}`.trim()} style={{ width: size, height: size }}>
      <img
        src="/logo.png"
        alt="mnemos"
        width={size}
        height={size}
        className="brand-mark-light"
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
      <img
        src="/logo-dark.png"
        alt=""
        width={size}
        height={size}
        className="brand-mark-dark"
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    </span>
  );
}
