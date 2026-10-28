export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="rgb(var(--purple))" />
      <path d="M8 22V13m6 9V9m6 13v-6" stroke="rgb(var(--on-brand))" strokeWidth="3" strokeLinecap="round" />
      <circle cx="24" cy="10" r="3" fill="rgb(var(--orange))" />
    </svg>
  );
}
