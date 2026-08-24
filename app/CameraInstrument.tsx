"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./CameraInstrument.module.css";

type CameraState = "opening" | "ready" | "denied" | "unsupported";
type MotionState = { x: number; y: number; energy: number; spread: number };
type Instrument = {
  context: AudioContext;
  primary: OscillatorNode;
  harmonic: OscillatorNode;
  primaryGain: GainNode;
  harmonicGain: GainNode;
  filter: BiquadFilterNode;
  panner: StereoPannerNode;
  master: GainNode;
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const note = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const pitchScale = [43, 46, 48, 50, 53, 55, 58, 60, 62, 65, 67, 70, 72];
const harmonyIntervals = [0, 3, 7, 12];

export default function CameraInstrument() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<Instrument | null>(null);
  const motionRef = useRef<MotionState>({ x: .5, y: .5, energy: .06, spread: .3 });
  const [cameraState, setCameraState] = useState<CameraState>("opening");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [motionLevel, setMotionLevel] = useState(.06);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;

    const render = (time: number) => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (canvas.width !== width * pixelRatio || canvas.height !== height * pixelRatio) {
        canvas.width = width * pixelRatio;
        canvas.height = height * pixelRatio;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);

      const motion = motionRef.current;
      const stageTop = Math.min(280, Math.max(190, height * .3));
      const stageHeight = height - stageTop;
      const centerY = stageTop + stageHeight * (.52 + (motion.y - .5) * .2);
      const amplitude = 18 + motion.energy * Math.min(190, stageHeight * .34);
      const frequency = 1.8 + motion.spread * 3.8;
      const speed = time * (.00045 + motion.energy * .0022);
      const hueShift = motion.x * 72;
      const colors = [`hsla(${186 + hueShift},100%,72%,.94)`, `hsla(${250 + hueShift},94%,72%,.78)`, `hsla(${315 + hueShift},95%,72%,.58)`, "rgba(255,255,255,.42)"];

      colors.forEach((color, layer) => {
        context.beginPath();
        for (let x = -8; x <= width + 8; x += 7) {
          const normalized = x / width;
          const envelope = Math.sin(Math.PI * normalized) ** 1.35;
          const wave = Math.sin(normalized * Math.PI * 2 * (frequency + layer * .36) + speed * (layer + 1) * 3.5);
          const detail = Math.sin(normalized * Math.PI * 2 * (frequency * 2.6 + motion.x * 2) - speed * 2.1) * motion.energy * 20;
          const pulse = Math.sin(normalized * Math.PI * 8 - speed * 7) * motion.energy * motion.spread * 12;
          const y = centerY + (wave * amplitude + detail + pulse) * envelope + (layer - 1.5) * 16;
          if (x === -8) context.moveTo(x, y); else context.lineTo(x, y);
        }
        context.strokeStyle = color;
        context.lineWidth = layer === 0 ? 2.4 : 1;
        context.shadowColor = color;
        context.shadowBlur = layer === 0 ? 18 + motion.energy * 28 : 8;
        context.stroke();
      });
      context.shadowBlur = 0;
      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, []);

  const updateAudio = useCallback((motion: MotionState) => {
    const instrument = audioRef.current;
    if (!instrument) return;
    const now = instrument.context.currentTime;
    const pitchIndex = Math.round((1 - motion.y) * (pitchScale.length - 1));
    const rootPitch = pitchScale[pitchIndex];
    const harmonyIndex = Math.min(harmonyIntervals.length - 1, Math.floor(motion.x * harmonyIntervals.length));
    const movementBend = (motion.energy - .3) * 1.7;
    instrument.primary.frequency.setTargetAtTime(note(rootPitch + movementBend), now, .055);
    instrument.harmonic.frequency.setTargetAtTime(note(rootPitch + harmonyIntervals[harmonyIndex]), now, .075);
    instrument.primaryGain.gain.setTargetAtTime(.012 + motion.energy * .1, now, .085);
    instrument.harmonicGain.gain.setTargetAtTime((.008 + motion.energy * .068) * (.55 + motion.spread), now, .1);
    instrument.filter.frequency.setTargetAtTime(300 + motion.spread * 3900, now, .08);
    instrument.panner.pan.setTargetAtTime(clamp((motion.x - .5) * 2, -1, 1), now, .07);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    let previousPixels: Uint8ClampedArray | null = null;
    let lastMeterUpdate = 0;
    const sample = document.createElement("canvas");
    sample.width = 72;
    sample.height = 54;
    const context = sample.getContext("2d", { willReadFrequently: true });

    const analyze = (time: number) => {
      const video = videoRef.current;
      if (!context || !video || video.readyState < 2) {
        frame = requestAnimationFrame(analyze);
        return;
      }
      context.drawImage(video, 0, 0, sample.width, sample.height);
      const pixels = context.getImageData(0, 0, sample.width, sample.height).data;

      if (previousPixels) {
        let weight = 0;
        let weightedX = 0;
        let weightedY = 0;
        for (let index = 0; index < pixels.length; index += 16) {
          const difference = Math.abs(pixels[index] - previousPixels[index]) + Math.abs(pixels[index + 1] - previousPixels[index + 1]) + Math.abs(pixels[index + 2] - previousPixels[index + 2]);
          if (difference < 30) continue;
          const pixelIndex = index / 4;
          const x = (pixelIndex % sample.width) / sample.width;
          const y = Math.floor(pixelIndex / sample.width) / sample.height;
          weight += difference;
          weightedX += x * difference;
          weightedY += y * difference;
        }

        if (weight > 700) {
          const x = 1 - weightedX / weight;
          const y = weightedY / weight;
          let weightedRadius = 0;
          for (let index = 0; index < pixels.length; index += 16) {
            const difference = Math.abs(pixels[index] - previousPixels[index]) + Math.abs(pixels[index + 1] - previousPixels[index + 1]) + Math.abs(pixels[index + 2] - previousPixels[index + 2]);
            if (difference < 30) continue;
            const pixelIndex = index / 4;
            const px = 1 - (pixelIndex % sample.width) / sample.width;
            const py = Math.floor(pixelIndex / sample.width) / sample.height;
            weightedRadius += Math.hypot(px - x, py - y) * difference;
          }
          motionRef.current = {
            x: clamp(x),
            y: clamp(y),
            energy: clamp(weight / 110000, .035, 1),
            spread: clamp((weightedRadius / weight) * 3.1, .12, 1),
          };
          updateAudio(motionRef.current);
        }

        if (time - lastMeterUpdate > 80) {
          setMotionLevel(motionRef.current.energy);
          lastMeterUpdate = time;
        }
      }
      previousPixels = new Uint8ClampedArray(pixels);
      frame = requestAnimationFrame(analyze);
    };

    const openCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState("unsupported");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraState("ready");
        frame = requestAnimationFrame(analyze);
      } catch {
        setCameraState("denied");
      }
    };

    void openCamera();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [updateAudio]);

  const toggleSound = async () => {
    if (!audioRef.current) {
      const context = new AudioContext();
      const primary = context.createOscillator();
      const harmonic = context.createOscillator();
      const primaryGain = context.createGain();
      const harmonicGain = context.createGain();
      const filter = context.createBiquadFilter();
      const panner = context.createStereoPanner();
      const master = context.createGain();
      primary.type = "sine";
      harmonic.type = "triangle";
      primaryGain.gain.value = 0;
      harmonicGain.gain.value = 0;
      filter.type = "lowpass";
      filter.frequency.value = 900;
      filter.Q.value = 2.8;
      master.gain.value = 0;
      primary.connect(primaryGain).connect(filter);
      harmonic.connect(harmonicGain).connect(filter);
      filter.connect(panner).connect(master).connect(context.destination);
      primary.start();
      harmonic.start();
      audioRef.current = { context, primary, harmonic, primaryGain, harmonicGain, filter, panner, master };
    }
    const instrument = audioRef.current;
    if (instrument.context.state === "suspended") await instrument.context.resume();
    const next = !soundEnabled;
    instrument.master.gain.setTargetAtTime(next ? .52 : 0, instrument.context.currentTime, .05);
    setSoundEnabled(next);
    if (next) updateAudio(motionRef.current);
  };

  useEffect(() => () => {
    const instrument = audioRef.current;
    if (instrument && instrument.context.state !== "closed") void instrument.context.close();
  }, []);

  const status = cameraState === "ready" ? "Camera active" : cameraState === "denied" ? "Camera unavailable" : cameraState === "unsupported" ? "Camera unsupported" : "Opening camera";

  return (
    <main className={styles.page}>
      <video ref={videoRef} className={styles.video} autoPlay muted playsInline aria-label="Live mirrored camera view" />
      <canvas ref={canvasRef} className={styles.waveCanvas} aria-hidden="true" />
      <div className={styles.vignette} aria-hidden="true" />
      <Link className={styles.backLink} href="/">← Home</Link>
      <span className={styles.privacy}>Camera stays on this device</span>
      <aside className={styles.controls} aria-label="Camera instrument controls">
        <div className={styles.controlHeader}>
          <span className={styles.status}>
            <span className={`${styles.dot} ${cameraState === "ready" ? styles.dotReady : cameraState === "denied" ? styles.dotDenied : ""}`} />
            {status}
          </span>
          <button type="button" className={styles.soundButton} onClick={() => void toggleSound()} aria-pressed={soundEnabled} disabled={cameraState !== "ready"}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 14h3l4 4V6L7 10H4z" />{soundEnabled && <path d="M15 9a4 4 0 0 1 0 6m2-8a7 7 0 0 1 0 10" />}</svg>
            {soundEnabled ? "Sound on" : "Enable sound"}
          </button>
        </div>
        <div className={styles.motionMeter} aria-label={`Motion level ${Math.round(motionLevel * 100)} percent`}><span style={{ transform: `scaleX(${Math.max(.025, motionLevel)})` }} /></div>
        <p className={styles.controlLabel}>Movement controls</p>
        <div className={styles.instructions}>
          <span className={styles.instruction}><i aria-hidden="true">↕</i><span>Hand / finger height<b>Pitch steps</b></span></span>
          <span className={styles.instruction}><i aria-hidden="true">↔</i><span>Side-to-side position<b>Harmony + stereo</b></span></span>
          <span className={styles.instruction}><i aria-hidden="true">≈</i><span>Movement speed<b>Bend + energy</b></span></span>
          <span className={styles.instruction}><i aria-hidden="true">⇱</i><span>Finger / hand spread<b>Tone + wave shape</b></span></span>
        </div>
        <p className={styles.inputMode}>Input: camera motion</p>
      </aside>
      {(cameraState === "denied" || cameraState === "unsupported") && <div className={styles.permissionMessage} role="status">Camera access is required for this instrument. Enable camera permissions, then reload the page.</div>}
    </main>
  );
}
