// Floating gradient blobs + 3D-ish shapes used as ambient decoration behind
// login screens. Purely visual, kept out of the tab order.
export default function AuthDecor() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="auth-blob absolute -top-32 -left-24 size-96 rounded-full bg-butter-300/40 blur-3xl" />
      <div className="auth-blob absolute top-1/3 -right-32 size-[28rem] rounded-full bg-sky-200/40 blur-3xl" style={{ animationDelay: '3s' }} />
      <div className="auth-blob absolute -bottom-24 left-1/4 size-80 rounded-full bg-butter-200/50 blur-3xl" style={{ animationDelay: '6s' }} />

      <div className="auth-float-a absolute top-[15%] left-[12%] size-16 rounded-2xl bg-linear-to-br from-butter-300 to-butter-500 opacity-70 shadow-xl shadow-butter-500/30" />
      <div className="auth-float-b absolute top-[60%] left-[20%] size-10 rounded-full bg-linear-to-br from-white to-butter-200 opacity-80 shadow-lg ring-1 ring-white/60" />
      <div className="auth-float-c absolute top-[25%] right-[18%] size-12 rounded-xl bg-linear-to-br from-sky-200 to-white opacity-80 shadow-lg ring-1 ring-white/60" />
      <div className="auth-float-a absolute bottom-[18%] right-[14%] size-20 rounded-3xl bg-linear-to-br from-butter-200 to-butter-400 opacity-60 shadow-xl shadow-butter-500/20" style={{ animationDelay: '1.5s' }} />

      <div className="auth-spin-slow absolute top-[45%] left-[8%] size-24 rounded-full border-2 border-dashed border-butter-400/40" />
      <div className="auth-spin-slow absolute bottom-[12%] right-[24%] size-16 rounded-full border-2 border-dashed border-sky-300/40" style={{ animationDirection: 'reverse' }} />
    </div>
  );
}
