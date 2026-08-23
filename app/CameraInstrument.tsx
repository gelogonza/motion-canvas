"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

export default function CameraInstrument() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<Instrument | null>(null);
  const motionRef = useRef<MotionState>({ x: .5, y: .5, energy: .06, spread: .3 });
  const [cameraState, setCameraState] = useState<CameraState>("opening");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [motionLevel, setMotionLevel] = useState(.06);

  const updateAudio = useCallback((motion: MotionState) => {
    const instrument = audioRef.current;
    if (!instrument) return;
    const now = instrument.context.currentTime;
    instrument.primary.frequency.setTargetAtTime(note(43 + (1 - motion.y) * 35), now, .055);
    instrument.harmonic.frequency.setTargetAtTime(note(51 + (1 - motion.y) * 29), now, .075);
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
      <div className={styles.vignette} aria-hidden="true" />
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
        <div className={styles.instructions}>
          <span>Move up/down <b>pitch</b></span><span>Move faster <b>energy</b></span><span>Move side-to-side <b>stereo</b></span><span>Use more of the frame <b>tone</b></span>
        </div>
        <p className={styles.inputMode}>Input: camera motion</p>
      </aside>
      {(cameraState === "denied" || cameraState === "unsupported") && <div className={styles.permissionMessage} role="status">Camera access is required for this instrument. Enable camera permissions, then reload the page.</div>}
    </main>
  );
}
