// Small drawings for the doors and the door sheet. Decorative only.

export function BowArt() {
  return (
    <svg className="adv-bow-art" viewBox="0 0 40 26" aria-hidden="true" data-icon-exempt>
      <path fill="currentColor" d="M20 12C13 1 3 2 4 10c1 7 10 6 16 2zM20 12c7-11 17-10 16-2-1 7-10 6-16 2z" />
      <path fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" d="M20 12l-6 12M20 12l6 12" />
      <circle cx="20" cy="12" r="4" fill="currentColor" />
      <path fill="#fff" opacity=".35" d="M9 6c3-1 6 1 8 4-3-1-6-2-8-4z" />
    </svg>
  );
}

export function OpenBoxArt() {
  return (
    <svg className="adv-mid-art" viewBox="0 0 40 36" aria-hidden="true" data-icon-exempt>
      <path d="M7 16h26v16a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" fill="var(--adv-berry)" />
      <path d="M18 16h4v18h-4z" fill="var(--adv-gold)" />
      <path d="M4 9l27-7 2 7-27 7z" fill="var(--adv-berry-2)" />
      <path d="M16 6l4-1 2 7-4 1z" fill="var(--adv-gold)" />
      <g fill="var(--adv-gold)">
        <circle cx="34" cy="16" r="1.4" />
        <circle cx="37" cy="11" r="1" />
        <circle cx="3" cy="20" r="1.2" />
      </g>
    </svg>
  );
}

export function FlakeArt() {
  return (
    <svg
      className="adv-mid-art"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
      data-icon-exempt
    >
      <path d="M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10M12 5l-2.5-2M12 5l2.5-2M12 19l-2.5 2M12 19l2.5 2M5.5 9.4 4.4 6.2M5.5 9.4 2.4 10M18.5 14.6l1.1 3.2M18.5 14.6l3.1-.6M5.5 14.6l-3.1-.6M5.5 14.6l-1.1 3.2M18.5 9.4l3.1.6M18.5 9.4l1.1-3.2" />
    </svg>
  );
}

export function StarArt() {
  return (
    <svg className="adv-mid-art" viewBox="0 0 24 24" aria-hidden="true" data-icon-exempt>
      <path
        fill="#fff7d6"
        stroke="#b07b14"
        strokeWidth="1.2"
        d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 16.9l-6.1 3.5 1.5-6.8L2.2 9l6.9-.7z"
      />
    </svg>
  );
}

export function WreathArt() {
  return (
    <svg className="adv-wreath" viewBox="0 0 100 100" aria-hidden="true" data-icon-exempt>
      <circle cx="50" cy="50" r="33" fill="none" stroke="#0f5a40" strokeWidth="16" />
      <circle cx="50" cy="50" r="33" fill="none" stroke="#2c9a63" strokeWidth="7" strokeDasharray="5 7" />
      <g fill="#ff4d5e">
        <circle cx="24" cy="38" r="3.6" />
        <circle cx="29" cy="34" r="3" />
        <circle cx="76" cy="62" r="3.6" />
        <circle cx="71" cy="68" r="3" />
        <circle cx="62" cy="20" r="3" />
        <circle cx="36" cy="79" r="3.2" />
      </g>
      <path d="M50 80c-12-10-20-6-16 1 3 5 10 2 16-1zM50 80c12-10 20-6 16 1-3 5-10 2-16-1z" fill="#c62a3e" />
      <path d="M50 80l-7 14M50 80l7 14" stroke="#c62a3e" strokeWidth="4" strokeLinecap="round" />
      <circle cx="50" cy="80" r="4" fill="#e0465a" />
    </svg>
  );
}
