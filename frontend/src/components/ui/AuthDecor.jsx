// Floating gradient blobs + 3D-ish shapes used as ambient decoration behind
// login screens. Purely visual, kept out of the tab order. Defaults to the
// fixed butter/sky look (Superadmin's own login); pass primary/secondary hex
// colors to tint it with a tenant's branding instead.
export default function AuthDecor({ primary, secondary }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div
        className={`auth-blob absolute -top-32 -left-24 size-96 rounded-full blur-3xl ${!primary ? 'bg-butter-300/40' : ''}`}
        style={primary ? { backgroundColor: primary, opacity: 0.35 } : undefined}
      />
      <div
        className={`auth-blob absolute top-1/3 -right-32 size-112 rounded-full blur-3xl ${!secondary ? 'bg-sky-200/40' : ''}`}
        style={{ animationDelay: '3s', ...(secondary ? { backgroundColor: secondary, opacity: 0.25 } : {}) }}
      />
      <div
        className={`auth-blob absolute -bottom-24 left-1/4 size-80 rounded-full blur-3xl ${!primary ? 'bg-butter-200/50' : ''}`}
        style={{ animationDelay: '6s', ...(primary ? { backgroundColor: primary, opacity: 0.3 } : {}) }}
      />

      <div
        className={`auth-float-a absolute top-[15%] left-[12%] size-16 rounded-2xl opacity-70 shadow-xl ${!primary ? 'bg-linear-to-br from-butter-300 to-butter-500 shadow-butter-500/30' : ''}`}
        style={primary ? { backgroundColor: primary } : undefined}
      />
      <div
        className={`auth-float-b absolute top-[60%] left-[20%] size-10 rounded-full opacity-80 shadow-lg ring-1 ring-white/60 ${!primary ? 'bg-linear-to-br from-white to-butter-200' : ''}`}
        style={primary ? { backgroundColor: primary } : undefined}
      />
      <div
        className={`auth-float-c absolute top-[25%] right-[18%] size-12 rounded-xl opacity-80 shadow-lg ring-1 ring-white/60 ${!secondary ? 'bg-linear-to-br from-sky-200 to-white' : ''}`}
        style={secondary ? { backgroundColor: secondary } : undefined}
      />
      <div
        className={`auth-float-a absolute bottom-[18%] right-[14%] size-20 rounded-3xl opacity-60 shadow-xl ${!primary ? 'bg-linear-to-br from-butter-200 to-butter-400 shadow-butter-500/20' : ''}`}
        style={{ animationDelay: '1.5s', ...(primary ? { backgroundColor: primary } : {}) }}
      />

      <div
        className={`auth-spin-slow absolute top-[45%] left-[8%] size-24 rounded-full border-2 border-dashed ${!primary ? 'border-butter-400/40' : ''}`}
        style={primary ? { borderColor: primary, opacity: 0.4 } : undefined}
      />
      <div
        className={`auth-spin-slow absolute bottom-[12%] right-[24%] size-16 rounded-full border-2 border-dashed ${!secondary ? 'border-sky-300/40' : ''}`}
        style={{ animationDirection: 'reverse', ...(secondary ? { borderColor: secondary, opacity: 0.4 } : {}) }}
      />
    </div>
  );
}
