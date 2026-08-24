import type { Metadata } from "next";
import CameraInstrument from "../CameraInstrument";

export const metadata: Metadata = {
  title: "Instrument — Motion Canvas",
  description: "Use camera motion to shape synthesized sound and reactive waves.",
};

export default function InstrumentPage() {
  return <CameraInstrument />;
}
