import Link from "next/link";

export default function Home() {
  return (
    <main className="landingPage">
      <div className="landingGlow landingGlowOne" aria-hidden="true" />
      <div className="landingGlow landingGlowTwo" aria-hidden="true" />
      <header className="landingHeader">
        <span className="wordmark">Motion Canvas</span>
        <span className="availability"><i /> Camera instrument</span>
      </header>

      <section className="landingHero">
        <p className="eyebrow">Movement becomes music</p>
        <h1>Move your body.<br />Shape the sound.</h1>
        <p className="landingIntro">
          An audiovisual instrument that turns motion captured by your camera into shifting tones, stereo movement, and responsive sound waves.
        </p>
        <Link className="startButton" href="/instrument">
          Start the instrument <span aria-hidden="true">↗</span>
        </Link>
      </section>

      <div className="landingWave" aria-hidden="true">
        <svg viewBox="0 0 1440 260" preserveAspectRatio="none">
          <path d="M0 128 C125 128 132 42 260 42 S390 220 520 220 650 74 780 74 912 181 1040 181 1174 108 1300 108 1392 128 1440 128" />
          <path d="M0 128 C144 128 180 88 300 88 S420 176 550 176 690 106 830 106 940 153 1080 153 1190 122 1440 128" />
        </svg>
      </div>

      <footer className="landingFooter">
        <span>No recording. Camera processing stays on-device.</span>
        <span>Headphones recommended</span>
      </footer>
    </main>
  );
}
