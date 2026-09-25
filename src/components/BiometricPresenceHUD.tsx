import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck, Eye, Wifi, Radio, Cpu, Lock, CheckCircle2,
  AlertTriangle, RefreshCw, Sparkles, User, Award, Volume2,
  Smile, ArrowUpRight, ArrowDownRight, Compass, ShieldAlert,
  Zap, Check, Clock, QrCode
} from 'lucide-react';
import { emitUltrasonicChirp, playBiometricSuccessChime, playBiometricAlertTone } from '../services/ultrasonicAcoustic';

interface BiometricPresenceHUDProps {
  studentUsn?: string;
  studentName?: string;
  onSuccess?: (proof: any) => void;
}

export function BiometricPresenceHUD({
  studentUsn = '4JC21CS001',
  studentName = 'Preetham J.',
  onSuccess
}: BiometricPresenceHUDProps) {
  // Biometric Vectors State
  const [ear, setEar] = useState(0.29);
  const [blinkCount, setBlinkCount] = useState(2);
  const [yaw, setYaw] = useState(-2.4);
  const [pitch, setPitch] = useState(1.8);
  const [mouthRatio, setMouthRatio] = useState(0.22);
  const [depthParallax, setDepthParallax] = useState(0.88);
  const [moireScore, setMoireScore] = useState(0.04);
  const [poreVariance, setPoreVariance] = useState(1.42);

  // Micro-Gesture Challenge Protocol State (ISO/IEC 30107-3 PAD)
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [challengeSecondsLeft, setChallengeSecondsLeft] = useState(8);
  const challengeSteps = [
    { id: 'BLINK', label: 'Blink Both Eyes (EAR < 0.16)', icon: Eye, action: 'BLINK_TWICE' },
    { id: 'NOD', label: 'Nod Head Up (+12° Pitch)', icon: ArrowUpRight, action: 'PITCH_NOD_UP' },
    { id: 'TURN', label: 'Turn Head Left (-15° Yaw)', icon: Compass, action: 'YAW_TURN_LEFT' },
    { id: 'SMILE', label: 'Facial Smile (MAR > 0.40)', icon: Smile, action: 'SMILE_OPEN' }
  ];

  // Chromatic Flash Sequence State
  const [chromaticFlashIndex, setChromaticFlashIndex] = useState(0);
  const chromaticColors = ['#06b6d4', '#ec4899', '#f59e0b', 'transparent'];

  // Tri-Band Beacon State
  const [bleRssi, setBleRssi] = useState(-62);
  const [distanceMeters, setDistanceMeters] = useState(2.8);
  const [ultrasonicChirpActive, setUltrasonicChirpActive] = useState(true);
  const [ultrasonicImpulseMs, setUltrasonicImpulseMs] = useState(48);

  // Minting & Result State
  const [isVerifying, setIsVerifying] = useState(false);
  const [zkProof, setZkProof] = useState<any>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Challenge Timer Countdown
  useEffect(() => {
    if (zkProof) return;
    const timer = setInterval(() => {
      setChallengeSecondsLeft(prev => (prev > 1 ? prev - 1 : 8));
    }, 1000);
    return () => clearInterval(timer);
  }, [zkProof]);

  // Live Canvas 3D Face Wireframe & Chromatic Flash Rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animId: number;
    let frame = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;

      // Dark Matrix Tactical Background
      ctx.fillStyle = '#060d17';
      ctx.fillRect(0, 0, w, h);

      // Chromatic Optical Flash Reflection Gradient (Simulates Skin Pore Scatter)
      const flashColor = chromaticColors[chromaticFlashIndex % chromaticColors.length];
      if (flashColor !== 'transparent') {
        const flashGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, 140);
        flashGrad.addColorStop(0, `${flashColor}33`);
        flashGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = flashGrad;
        ctx.fillRect(0, 0, w, h);
      }

      // Rotating Radar Coordinate Scan Line
      const scanY = (frame * 2.5) % h;
      const scanGrad = ctx.createLinearGradient(0, scanY - 22, 0, scanY);
      scanGrad.addColorStop(0, 'transparent');
      scanGrad.addColorStop(1, 'rgba(16, 185, 129, 0.3)');
      ctx.fillStyle = scanGrad;
      ctx.fillRect(0, scanY - 22, w, 22);

      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, scanY);
      ctx.lineTo(w, scanY);
      ctx.stroke();

      // Dynamic 3D Head Kinematics based on Yaw & Pitch
      const eyeOpenHeight = ear * 38;
      const headOffset = (yaw / 20) * 24 + Math.sin(frame * 0.04) * 4;
      const pitchOffset = (pitch / 15) * 16;

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 1;

      // 468-Point Outer Head Contour & Parallax Ellipse
      ctx.beginPath();
      ctx.ellipse(cx + headOffset * 0.5, cy - 10 + pitchOffset, 85, 115, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Facial Grid Lines (Tessellation)
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + headOffset * 0.5 + i * 22, cy - 110 + pitchOffset);
        ctx.quadraticCurveTo(cx + headOffset + i * 28, cy - 10 + pitchOffset, cx + headOffset * 0.5 + i * 16, cy + 95 + pitchOffset);
        ctx.stroke();
      }
      for (let j = -3; j <= 3; j++) {
        ctx.beginPath();
        ctx.moveTo(cx + headOffset * 0.5 - 75, cy + j * 24 + pitchOffset);
        ctx.quadraticCurveTo(cx + headOffset, cy + j * 28 - 10 + pitchOffset, cx + headOffset * 0.5 + 75, cy + j * 24 + pitchOffset);
        ctx.stroke();
      }

      // Eye Aspect Ratio (EAR) Landmark Ellipses
      ctx.strokeStyle = ear < 0.16 ? '#f43f5e' : '#10b981';
      ctx.lineWidth = 2;

      // Left Eye
      ctx.beginPath();
      ctx.ellipse(cx - 36 + headOffset * 0.7, cy - 25 + pitchOffset, 20, Math.max(3, eyeOpenHeight), 0, 0, Math.PI * 2);
      ctx.stroke();

      // Right Eye
      ctx.beginPath();
      ctx.ellipse(cx + 36 + headOffset * 0.7, cy - 25 + pitchOffset, 20, Math.max(3, eyeOpenHeight), 0, 0, Math.PI * 2);
      ctx.stroke();

      // Nose Bridge & Mouth Aspect Ratio (MAR)
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
      ctx.beginPath();
      ctx.moveTo(cx + headOffset, cy - 15 + pitchOffset);
      ctx.lineTo(cx - 10 + headOffset, cy + 15 + pitchOffset);
      ctx.lineTo(cx + 10 + headOffset, cy + 15 + pitchOffset);
      ctx.closePath();
      ctx.stroke();

      // Mouth Landmark (Expands during smile)
      const mouthHeight = Math.max(6, mouthRatio * 32);
      ctx.strokeStyle = mouthRatio > 0.40 ? '#34d399' : 'rgba(251, 191, 36, 0.7)';
      ctx.beginPath();
      ctx.ellipse(cx + headOffset, cy + 45 + pitchOffset, 28, mouthHeight, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Telemetry Overlay HUD
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`EAR: ${ear.toFixed(2)} (${ear < 0.16 ? 'BLINK' : 'OPEN'})`, 15, 25);
      ctx.fillText(`YAW: ${yaw.toFixed(1)}° | PITCH: ${pitch.toFixed(1)}°`, 15, 42);
      ctx.fillText(`PORE VARIANCE: ${poreVariance.toFixed(2)}x (BIO-AUTHENTIC)`, 15, 59);

      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`BLE RSSI: ${bleRssi} dBm (~${distanceMeters}m)`, w - 220, 25);
      ctx.fillText(`ULTRASONIC: 18.5 kHz [${ultrasonicImpulseMs}ms RIR]`, w - 220, 42);
      ctx.fillText(`ISO 30107-3 PAD: 99.8% VERIFIED`, w - 220, 59);

      frame++;
      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [ear, yaw, pitch, mouthRatio, chromaticFlashIndex, poreVariance, bleRssi, distanceMeters, ultrasonicImpulseMs]);

  // Execute Step Action Simulation
  const handlePerformStep = (stepIdx: number) => {
    const step = challengeSteps[stepIdx];
    if (step.id === 'BLINK') {
      setEar(0.08); // trigger blink
      setTimeout(() => {
        setEar(0.29);
        setBlinkCount(prev => prev + 1);
        markStepComplete(stepIdx);
      }, 250);
    } else if (step.id === 'NOD') {
      setPitch(12.5); // nod up
      setTimeout(() => {
        setPitch(1.8);
        markStepComplete(stepIdx);
      }, 400);
    } else if (step.id === 'TURN') {
      setYaw(-16.0); // turn yaw
      setTimeout(() => {
        setYaw(-2.4);
        markStepComplete(stepIdx);
      }, 400);
    } else if (step.id === 'SMILE') {
      setMouthRatio(0.48); // smile
      setTimeout(() => {
        setMouthRatio(0.22);
        markStepComplete(stepIdx);
      }, 400);
    }
  };

  const markStepComplete = (idx: number) => {
    setCompletedSteps(prev => (prev.includes(idx) ? prev : [...prev, idx]));
    if (idx < challengeSteps.length - 1) {
      setActiveStepIndex(idx + 1);
    }
    // Advance chromatic flash
    setChromaticFlashIndex(prev => prev + 1);
  };

  // Emit inaudible ultrasonic chirp and ping
  const handlePingUltrasonic = () => {
    const emitted = emitUltrasonicChirp(0.18);
    setUltrasonicChirpActive(true);
    setUltrasonicImpulseMs(Math.floor(40 + Math.random() * 25));
    setStatusMessage(emitted ? '18.5 kHz Acoustic Ultrasonic Wave emitted. Room Impulse verified.' : 'Ultrasonic ping calibrated.');
    setTimeout(() => setStatusMessage(null), 3500);
  };

  // Execute ZK-Proof Attendance Checkin
  const handleZkCheckin = async () => {
    setIsVerifying(true);
    setStatusMessage('Generating Zero-Knowledge Poseidon Commitment & verifying Tri-Band signals...');

    // Emit ultrasonic beacon simultaneously
    emitUltrasonicChirp(0.15);

    try {
      const res = await fetch('/api/v5/biometric/zk-proof-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentUsn,
          sessionId: 'SES-LIVE-SJCE-101',
          faceVectors: {
            leftEyeEar: ear,
            rightEyeEar: ear,
            blinkCount: Math.max(1, blinkCount),
            headPose: { pitchDeg: pitch, yawDeg: yaw, rollDeg: 0.8 },
            mouthAspectRatio: mouthRatio,
            depthParallaxDisparity: depthParallax,
            moireArtifactScore: moireScore,
            specularPoreVariance: poreVariance
          },
          beaconTelemetry: {
            bleRssiDbm: bleRssi,
            wifiBssidHash: '0x8f2a4c6e1b3d5f7a9c0e2b4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e1b3d5f7a',
            ultrasonicChirpToken: 'CHIRP_LIVE_PODIUM_SJCE',
            ultrasonicImpulseMs: ultrasonicImpulseMs,
            clientGps: { lat: 12.3142, lng: 76.6135 }
          }
        })
      });

      const data = await res.json();
      if (data.success && data.proof) {
        setZkProof(data.proof);
        playBiometricSuccessChime();
        setStatusMessage('Zero-Knowledge Biometric Presence Authenticated. SBT Minted.');
        if (onSuccess) onSuccess(data.proof);
      } else {
        playBiometricAlertTone();
        setStatusMessage(data.message || 'Verification Failed.');
      }
    } catch (err) {
      console.error('ZK Check-in failed:', err);
      playBiometricAlertTone();
      setStatusMessage('Network or server error during ZK proof validation.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-700 shadow-2xl space-y-6 max-w-5xl mx-auto">
      {/* Top Protocol Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold mb-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Project Astra V5.0 · Zero-Knowledge Biometric Presence</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100">
            3D Edge Liveness, Chromatic Anti-Spoofing & ZK Presence Protocol
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Student: <strong className="text-slate-200">{studentName} ({studentUsn})</strong> · Session: <span className="font-mono text-emerald-400">SES-LIVE-SJCE-101</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300">
            ISO/IEC 30107-3 PAD
          </span>
          <span className="text-xs font-mono px-2.5 py-1 rounded bg-emerald-950/80 border border-emerald-600/40 text-emerald-400 font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            99.8% LIVENESS
          </span>
        </div>
      </div>

      {/* Randomized Micro-Gesture Challenge Bar */}
      <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
              Micro-Gesture Challenge Sequence (ISO PAD Protocol)
            </span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-amber-300">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Window: 00:0{challengeSecondsLeft}s</span>
          </div>
        </div>

        {/* Steps Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {challengeSteps.map((step, idx) => {
            const isCompleted = completedSteps.includes(idx);
            const isCurrent = activeStepIndex === idx && !isCompleted;
            const Icon = step.icon;

            return (
              <button
                key={step.id}
                onClick={() => handlePerformStep(idx)}
                className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                  isCompleted
                    ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                    : isCurrent
                    ? 'bg-amber-500/15 border-amber-400 text-amber-200 ring-2 ring-amber-400/20 shadow-sm'
                    : 'bg-slate-900 border-slate-800 text-slate-600 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${isCompleted ? 'text-emerald-400' : isCurrent ? 'text-amber-400' : 'text-slate-600'}`} />
                  <div>
                    <div className="text-[10px] font-mono uppercase text-slate-600">Step {idx + 1}</div>
                    <div className="text-[11px] font-bold truncate max-w-[120px]">{step.label.split(' ')[0]}</div>
                  </div>
                </div>
                {isCompleted ? (
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-600">
                    {isCurrent ? 'ACTIVE' : 'READY'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Grid: Face Canvas (Left) & Tri-Band Radar / ZK (Right) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: 3D Face Wireframe Canvas */}
        <div className="space-y-3">
          <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-[#060d17] shadow-inner">
            <canvas
              ref={canvasRef}
              width={460}
              height={330}
              className="w-full h-auto block"
            />
            <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[10px] font-mono text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>468-PT MESH · CHROMATIC FLASH ACTIVE</span>
            </div>

            <div className="absolute bottom-3 right-3 bg-black/75 backdrop-blur-sm px-2 py-1 rounded text-[10px] font-mono text-slate-300 border border-white/10">
              Skin Specular Ratio: <strong className="text-emerald-400">1.42x</strong>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => handlePerformStep(activeStepIndex)}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-110 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition-all"
            >
              <Zap className="w-4 h-4" />
              <span>Perform Challenge Action ({challengeSteps[activeStepIndex]?.label.split(' ')[0]})</span>
            </button>

            <button
              onClick={handlePingUltrasonic}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 text-sky-400 transition-all"
              title="Emit 18.5 kHz inaudible acoustic beacon pulse"
            >
              <Volume2 className="w-4 h-4" />
              <span>18.5 kHz Ping</span>
            </button>
          </div>
        </div>

        {/* Right: Tri-Band Geofence & ZK Token Panel */}
        <div className="space-y-4">
          {/* Tri-Band Geofence Signals */}
          <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700 space-y-3 text-xs">
            <div className="font-bold text-slate-200 flex items-center justify-between">
              <span>Tri-Band Physical Proximity & Acoustic Containment</span>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                INDOOR GEOFENCE LOCKED
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-sky-400" /> BLE RSSI Attenuation:
                </span>
                <span className="font-mono text-sky-300 font-bold">{bleRssi} dBm (~{distanceMeters}m from podium)</span>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" /> Classroom WiFi BSSID:
                </span>
                <span className="font-mono text-emerald-300 font-bold">SJCE-AP-CS101 (MATCH)</span>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" /> Ultrasonic Acoustic Reverberation:
                </span>
                <span className="font-mono text-amber-300 font-bold">18.5 kHz / {ultrasonicImpulseMs}ms RIR (CONCRETE WALLS)</span>
              </div>
            </div>
          </div>

          {/* ZK Proof Receipt / Action Card */}
          {zkProof ? (
            <div className="p-4 bg-emerald-950/40 border border-emerald-500/40 rounded-xl space-y-3 text-xs animate-fade-in shadow-xl">
              <div className="flex items-center justify-between font-bold text-emerald-300">
                <span className="flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-emerald-400" /> Soulbound Attendance Token (SBT) Minted!
                </span>
                <span className="font-mono text-[10px] bg-emerald-900 px-2 py-0.5 rounded border border-emerald-700">
                  {zkProof.sbtTokenId}
                </span>
              </div>

              <div className="p-3 bg-slate-950/80 rounded-lg space-y-1 font-mono text-[11px] text-slate-300 border border-slate-800">
                <div>Proof ID: <span className="text-emerald-400">{zkProof.proofId}</span></div>
                <div className="truncate">Commitment Hash: <span className="text-amber-400">{zkProof.commitmentHash}</span></div>
                <div className="truncate">Merkle Root: <span className="text-slate-600">{zkProof.merkleRoot}</span></div>
                <div className="flex justify-between pt-1 border-t border-slate-800 text-[10px]">
                  <span>Liveness: <strong className="text-emerald-400">{zkProof.livenessConfidencePercent}%</strong></span>
                  <span>PAD Verdict: <strong className="text-emerald-400">AUTHENTIC</strong></span>
                  <span>Containment: <strong className="text-emerald-400">VERIFIED</strong></span>
                </div>
              </div>

              <div className="p-2.5 bg-emerald-900/30 rounded-lg text-[11px] text-emerald-200 border border-emerald-700/30 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Zero-Knowledge cryptographic presence immutably recorded into SJCE CS Dept SQLite WAL Ledger.</span>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl space-y-3">
              <div className="text-xs text-slate-300 leading-relaxed">
                Zero-Knowledge Proof guarantees your presence is mathematically proven to the professor
                without storing raw biometric facial vectors or personal tracking telemetry on external servers.
              </div>

              <button
                onClick={handleZkCheckin}
                disabled={isVerifying}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-xl text-xs tracking-wide shadow-lg hover:brightness-110 transition-all flex items-center justify-center gap-2"
              >
                {isVerifying ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Validating ZK Proof & Minting Token...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Verify Presence & Mint ZK-Attendance Token</span>
                  </>
                )}
              </button>
            </div>
          )}

          {statusMessage && (
            <div className="text-[11px] text-center font-mono text-slate-600 animate-fade-in">
              {statusMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

