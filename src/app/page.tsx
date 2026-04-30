"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./splash.module.css";

const MOTE_COUNT = 18;

type Mote = {
  left: string;
  top: string;
  size: string;
  duration: string;
  delay: string;
  opacity: number;
};

function generateMotes(): Mote[] {
  return Array.from({ length: MOTE_COUNT }, () => {
    const s = 1 + Math.random() * 2;
    return {
      left: Math.random() * 100 + "%",
      top: 70 + Math.random() * 30 + "%",
      size: s + "px",
      duration: 7 + Math.random() * 5 + "s",
      delay: Math.random() * 5 + "s",
      opacity: 0.3 + Math.random() * 0.4,
    };
  });
}

export default function SplashPage() {
  const router = useRouter();
  const [motes, setMotes] = useState<Mote[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const navigatedRef = useRef(false);

  useEffect(() => {
    setMotes(generateMotes());
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!navigatedRef.current) {
        navigatedRef.current = true;
        router.push("/dashboard");
      }
    }, 3500);
    return () => clearTimeout(t);
  }, [router]);

  const handleDismiss = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    setDismissed(true);
    setTimeout(() => router.push("/dashboard"), 300);
  };

  return (
    <div
      className={styles.splash + (dismissed ? " " + styles.dismissed : "")}
      role="img"
      aria-label="Driven Talent — Workforce Solutions"
      onClick={handleDismiss}
    >
      <div className={styles.motes}>
        {motes.map((m, i) => (
          <span
            key={i}
            className={styles.mote}
            style={
              {
                left: m.left,
                top: m.top,
                width: m.size,
                height: m.size,
                animationDuration: m.duration,
                animationDelay: m.delay,
                "--m-op": m.opacity,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div className={styles.label}>A Roxanna &amp; Co. Operation</div>

      <div className={styles.cornerTL}>
        <svg viewBox="0 0 28 28" fill="none" stroke="#1a1a1a" strokeWidth="0.6">
          <path d="M0 8V0H8" />
        </svg>
      </div>
      <div className={styles.cornerTR}>
        <svg viewBox="0 0 28 28" fill="none" stroke="#1a1a1a" strokeWidth="0.6">
          <path d="M28 8V0H20" />
        </svg>
      </div>
      <div className={styles.cornerBL}>
        <svg viewBox="0 0 28 28" fill="none" stroke="#1a1a1a" strokeWidth="0.6">
          <path d="M0 20V28H8" />
        </svg>
      </div>
      <div className={styles.cornerBR}>
        <svg viewBox="0 0 28 28" fill="none" stroke="#1a1a1a" strokeWidth="0.6">
          <path d="M28 20V28H20" />
        </svg>
      </div>

      <div className={styles.stack}>
        <div className={styles.eyebrow}>— EST. CALIFORNIA · 2014 —</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/dt-logo.jpg"
          alt="Driven Talent"
          className={styles.logoMark}
        />
        <div className={styles.wordmark} data-text="DRIVEN TALENT">
          DRIVEN TALENT
        </div>
        <div className={styles.tagline}>
          <span>Workforce</span>
          <span className={styles.bullet} />
          <span>Solutions</span>
        </div>
      </div>

      <div className={styles.hint}>tap anywhere to continue</div>
      <div className={styles.horizon} />
      <div className={styles.footer}>
        <span>San Francisco</span>
        <span className={styles.sep}>/</span>
        <span>Sonoma</span>
        <span className={styles.sep}>/</span>
        <span>Sacramento</span>
      </div>
    </div>
  );
}
