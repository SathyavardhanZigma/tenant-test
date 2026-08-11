import { useRef } from 'react';

// A glassmorphic card that tilts toward the cursor in 3D, for login screens.
export default function AuthCard({ children, className = '' }) {
  const cardRef = useRef(null);

  const handleMouseMove = (event) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    card.style.transform = `perspective(1000px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateZ(0)`;
  };

  const handleMouseLeave = () => {
    const card = cardRef.current;
    if (!card) return;
    card.style.transform = 'perspective(1000px) rotateY(0deg) rotateX(0deg) translateZ(0)';
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`auth-tilt-card rounded-3xl border border-white/60 bg-white/70 p-8 shadow-2xl shadow-butter-500/10 backdrop-blur-xl ${className}`}
    >
      {children}
    </div>
  );
}
