import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { onQuirk, type QuirkName } from "../../lib/quirks";
import { Person } from "./Person";
import { useLive, type Live, type Mood } from "./rig";

/**
 * Oliver and Aria as rigged 3D characters (GLB exported from Blender, see character3d/README.md).
 *
 * Layers, from bottom to top, all evaluated every frame:
 *  1. Body clip for the current state (idle / listening / thinking / talking / cheering / walking),
 *     cross-faded so changes never pop.
 *  2. One-off quirks (bow, wave, bow-tie fix, cap fix, safety demo...) layered in at sensible moments.
 *  3. Gaze: eyes lead, head follows a beat later (toward the cursor, or up-and-aside while thinking).
 *  4. Face: blinks, a mood expression, and mouth shapes driven by the voice loudness.
 */

export type Variant = "oliver" | "aria";
export type Framing = "full" | "body" | "bust";

const MODEL_URL: Record<Variant, string> = { oliver: "/models/oliver.glb", aria: "/models/aria.glb" };

/** Which clip plays for each named quirk, per character. */
const QUIRKS: Record<Variant, Record<"wave" | "greet" | "shrug" | "focus", string> & { fidget: string[] }> = {
  oliver: { wave: "quirk_wave", greet: "quirk_bow", shrug: "quirk_shrug", focus: "quirk_bowtie", fidget: ["quirk_bowtie"] },
  aria: { wave: "quirk_wave", greet: "quirk_greet", shrug: "quirk_shrug", focus: "quirk_safety_demo", fidget: ["quirk_adjust_cap", "quirk_tuck_hair"] },
};

/** Resting expression for each mood (morph target weights 0..1). */
const MOOD_FACE: Record<Mood, Partial<Record<string, number>>> = {
  idle: { smile: 0.22 },
  happy: { smile: 0.6, browUp: 0.15 },
  focus: { browDown: 0.2, squint: 0.12, smile: 0.08 },
  sleepy: { jawOpen: 0.04 },
  think: { browInnerUp: 0.45, mouthPucker: 0.15, browUp_L: 0.2 },
  cheer: { smileOpen: 0.85, browUp: 0.45, eyeWide: 0.25 },
  oops: { browInnerUp: 0.6, frown: 0.25, eyeWide: 0.15 },
};

const FACE_KEYS = [
  "blink_L", "blink_R", "eyeWide", "squint", "browUp", "browDown", "browInnerUp", "browUp_L",
  "smile", "smileOpen", "frown", "jawOpen", "mouthPucker", "noseScrunch",
  "viseme_aa", "viseme_E", "viseme_I", "viseme_O", "viseme_U", "viseme_PP", "viseme_FF", "viseme_TH", "viseme_SS",
] as const;
type FaceKey = (typeof FACE_KEYS)[number];
const MOUTH_SHAPES: FaceKey[] = ["viseme_O", "viseme_E", "viseme_I", "viseme_U", "viseme_TH", "viseme_SS"];

/* ------------------------------------------------------------------ */

export default function Character3D({
  variant, mood, size, framing = "body", walking = false, facing = 0,
}: {
  variant: Variant;
  mood: Mood;
  size: number;
  framing?: Framing;
  /** Play the walk cycle (move the window/sprite yourself; the walk stays in place). */
  walking?: boolean;
  /** Turn to face a direction, radians around the vertical axis (0 = toward the user, ±π/2 = sideways). */
  facing?: number;
}) {
  const live = useLive(mood);
  const wrap = useRef<HTMLDivElement>(null);
  const visible = useVisible(wrap);
  const w = size;
  const h = Math.round(size * 1.1);
  const fallback = <Person variant={variant} mood={mood} size={size} />;

  return (
    <div ref={wrap} style={{ width: w, height: h }} aria-label={`${variant === "oliver" ? "Oliver" : "Aria"} is ${stateName(live)}`}>
      <WebGLBoundary fallback={fallback}>
        <Suspense fallback={fallback}>
          <Canvas
            frameloop={visible ? "always" : "never"}
            dpr={[1, 2]}
            gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
            camera={{ fov: 22, near: 0.05, far: 50 }}
            onCreated={({ gl }) => {
              gl.toneMapping = THREE.NeutralToneMapping;
              gl.toneMappingExposure = 1.05;
              gl.outputColorSpace = THREE.SRGBColorSpace;
            }}
            style={{ width: w, height: h, background: "transparent" }}
          >
            <Lights />
            <Model variant={variant} live={live} framing={framing} walking={walking} facing={facing} visible={visible} />
          </Canvas>
        </Suspense>
      </WebGLBoundary>
    </div>
  );
}

function stateName(l: Live) {
  return l.listening ? "listening" : l.thinking ? "thinking" : l.talking ? "talking" : l.mood;
}

function Lights() {
  return (
    <>
      <hemisphereLight args={[0xfff4ea, 0x3a3346, 1.15]} />
      <directionalLight position={[1.6, 2.6, 2.4]} intensity={2.1} color={0xfff1e2} />
      <directionalLight position={[-2.2, 1.4, 1.6]} intensity={0.7} color={0xdfe8ff} />
      <directionalLight position={[0, 2.2, -2.6]} intensity={1.1} color={0xffffff} />
    </>
  );
}

/* ------------------------------------------------------------------ */

type MorphSlot = { mesh: THREE.Mesh; index: number };

function Model({ variant, live, framing, walking, facing, visible }: { variant: Variant; live: Live; framing: Framing; walking: boolean; facing: number; visible: boolean }) {
  const gltf = useGLTF(MODEL_URL[variant]);
  const { camera, size } = useThree();

  // Each on-screen copy gets its own skeleton (the app can show the same character twice, e.g. tucked + main).
  const scene = useMemo(() => cloneSkinned(gltf.scene) as THREE.Group, [gltf.scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(scene), [scene]);
  const clips = useMemo(() => new Map(gltf.animations.map((c) => [c.name, c])), [gltf.animations]);

  const rig = useMemo(() => {
    const bone = (n: string) => (scene.getObjectByName(`mixamorig${n}`) ?? scene.getObjectByName(`mixamorig:${n}`)) as THREE.Bone | undefined;
    const morphs = new Map<string, MorphSlot[]>();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.frustumCulled = false; // skinned bounds don't follow the animation
        if (m.morphTargetDictionary && m.morphTargetInfluences) {
          for (const [k, i] of Object.entries(m.morphTargetDictionary)) {
            if (!morphs.has(k)) morphs.set(k, []);
            morphs.get(k)!.push({ mesh: m, index: i });
          }
        }
      }
    });
    const eyeL = bone("LeftEye");
    const eyeR = bone("RightEye");
    // Eye bones may not be keyed by every clip, so remember their rest pose and restore it each frame.
    const eyeRest = [eyeL?.quaternion.clone(), eyeR?.quaternion.clone()] as const;
    return { head: bone("Head"), neck: bone("Neck"), eyeL, eyeR, eyeRest, morphs };
  }, [scene]);

  // Frame the camera on the character once (height comes from the head bone, so it fits Oliver and Aria alike).
  useEffect(() => {
    scene.updateMatrixWorld(true);
    const headY = rig.head ? rig.head.getWorldPosition(new THREE.Vector3()).y : 1.7;
    const top = headY + 0.3;
    const frac = framing === "full" ? 1.0 : framing === "body" ? 0.6 : 0.34;
    const bottom = top - top * frac;
    const span = (top - bottom) * (framing === "full" ? 1.06 : 1.12);
    const cam = camera as THREE.PerspectiveCamera;
    cam.aspect = size.width / size.height;
    const fov = THREE.MathUtils.degToRad(cam.fov);
    const dist = span / 2 / Math.tan(fov / 2);
    const cy = bottom + (top - bottom) / 2;
    cam.position.set(0, cy + span * 0.04, dist);
    cam.lookAt(0, cy, 0);
    cam.updateProjectionMatrix();
  }, [scene, rig, framing, camera, size.width, size.height]);

  // ---- body state machine -------------------------------------------------
  const base = live.cheering ? "cheering"
    : walking ? "walking"
    : live.talking ? "talking"
    : live.thinking ? "thinking"
    : live.listening ? "listening"
    : "idle";

  const current = useRef<{ base: string | null; baseAction: THREE.AnimationAction | null; quirk: THREE.AnimationAction | null }>({ base: null, baseAction: null, quirk: null });

  const fadeTo = (name: string, fade = 0.35) => {
    const clip = clips.get(name);
    if (!clip) return null;
    const a = mixer.clipAction(clip);
    a.enabled = true;
    a.setLoop(THREE.LoopRepeat, Infinity);
    a.reset().setEffectiveWeight(1).fadeIn(fade).play();
    // Sleepy: same idle, just slower and heavier.
    a.timeScale = live.asleep && name === "idle" ? 0.55 : 1;
    const prev = current.current.baseAction;
    if (prev && prev !== a) prev.fadeOut(fade);
    current.current.baseAction = a;
    current.current.base = name;
    return a;
  };

  useEffect(() => {
    const c = current.current;
    if (c.quirk && base !== "idle") stopQuirk(0.25); // never let a quirk talk over a real state change
    if (c.base !== base) fadeTo(base, c.base === null ? 0 : 0.35);
    else if (c.baseAction) c.baseAction.timeScale = live.asleep && base === "idle" ? 0.55 : 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, live.asleep]);

  const stopQuirk = (fade = 0.35) => {
    const c = current.current;
    if (!c.quirk) return;
    c.quirk.fadeOut(fade);
    c.quirk = null;
    if (c.baseAction) c.baseAction.reset().fadeIn(fade).play();
  };

  const playClipOnce = (name: string) => {
    const c = current.current;
    const clip = clips.get(name);
    if (!clip || c.quirk) return false;
    const a = mixer.clipAction(clip);
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.fadeIn(0.3).play();
    c.baseAction?.fadeOut(0.3);
    c.quirk = a;
    return true;
  };

  useEffect(() => {
    const onFinished = (e: { action: THREE.AnimationAction }) => {
      if (e.action === current.current.quirk) stopQuirk(0.4);
    };
    mixer.addEventListener("finished", onFinished as never);
    return () => {
      mixer.removeEventListener("finished", onFinished as never);
      mixer.stopAllAction();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mixer]);

  // Quirks: asked for by the app, triggered by mood changes, or idle habits when nothing is going on.
  const busy = !visible || live.talking || live.listening || live.thinking || live.cheering || walking || live.asleep;
  const stateRef = useRef({ busy, mood: live.mood });
  stateRef.current = { busy, mood: live.mood };

  const runQuirk = (q: QuirkName) => {
    if (stateRef.current.busy) return;
    const table = QUIRKS[variant];
    const name = q === "fidget" ? table.fidget[Math.floor(Math.random() * table.fidget.length)]
      : q === "wave" || q === "greet" || q === "shrug" || q === "focus" ? table[q]
      : q;
    playClipOnce(name);
  };
  const runQuirkRef = useRef(runQuirk);
  runQuirkRef.current = runQuirk;

  useEffect(() => onQuirk((q) => runQuirkRef.current(q)), []);

  const prevMood = useRef(live.mood);
  useEffect(() => {
    const from = prevMood.current;
    prevMood.current = live.mood;
    if (from === live.mood) return;
    if (live.mood === "oops") runQuirkRef.current("shrug");
    else if (live.mood === "focus") {
      const t = window.setTimeout(() => runQuirkRef.current("focus"), 350);
      return () => window.clearTimeout(t);
    } else if (live.mood === "happy" && from === "sleepy") runQuirkRef.current("greet");
  }, [live.mood]);

  useEffect(() => {
    // A polite hello the first time this copy appears in a happy mood (e.g. the companion picker).
    if (live.mood === "happy") { const t = window.setTimeout(() => runQuirkRef.current("greet"), 600); return () => window.clearTimeout(t); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let t = 0;
    const schedule = () => {
      t = window.setTimeout(() => {
        if (!stateRef.current.busy && stateRef.current.mood !== "focus") runQuirkRef.current("fidget");
        schedule();
      }, 16000 + Math.random() * 18000);
    };
    schedule();
    return () => window.clearTimeout(t);
  }, [variant]);

  // ---- per-frame: mixer, gaze, face ---------------------------------------
  const face = useRef<Record<string, number>>({});
  const gaze = useRef({ eyeX: 0, eyeY: 0, headX: 0, headY: 0, glanceUntil: 0, glanceX: 0, glanceY: 0 });
  const lip = useRef({ t: 0, open: 0, shape: "viseme_O" as FaceKey, shapeT: 0, level: 0 });
  const turn = useRef(facing);
  const tmpQ = useMemo(() => ({ a: new THREE.Quaternion(), b: new THREE.Quaternion(), e: new THREE.Euler() }), []);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    if (rig.eyeL && rig.eyeRest[0]) rig.eyeL.quaternion.copy(rig.eyeRest[0]);
    if (rig.eyeR && rig.eyeRest[1]) rig.eyeR.quaternion.copy(rig.eyeRest[1]);
    mixer.update(dt);

    // Facing (smooth turn toward walking direction etc.)
    turn.current += (facing - turn.current) * Math.min(1, dt * 6);
    scene.rotation.y = turn.current;

    // --- gaze: eyes lead, head follows ---
    const g = gaze.current;
    const now = state.clock.elapsedTime;
    let tx = live.look.x / 7; // -1..1, + = toward screen right
    let ty = live.look.y / 6; // -1..1, + = down
    if (live.asleep) { tx = 0; ty = 0.6; }
    // Idle glances: every so often look somewhere else for a moment, like a person would.
    if (!busy && now > g.glanceUntil + 4 && Math.random() < dt * 0.12) {
      g.glanceUntil = now + 0.9 + Math.random() * 0.8;
      g.glanceX = (Math.random() * 2 - 1) * 0.9;
      g.glanceY = (Math.random() * 2 - 1) * 0.4;
    }
    if (now < g.glanceUntil) { tx = g.glanceX; ty = g.glanceY; }
    g.eyeX += (tx - g.eyeX) * Math.min(1, dt * 14);
    g.eyeY += (ty - g.eyeY) * Math.min(1, dt * 14);
    g.headX += (tx - g.headX) * Math.min(1, dt * 3.2);
    g.headY += (ty - g.headY) * Math.min(1, dt * 3.2);

    const headWeight = base === "walking" || base === "cheering" ? 0.25 : 0.55;
    if (rig.head) rotateInWorld(rig.head, g.headX * 0.42 * headWeight, g.headY * 0.22 * headWeight, tmpQ);
    scene.updateMatrixWorld(true);
    for (const eye of [rig.eyeL, rig.eyeR]) if (eye) rotateInWorld(eye, (g.eyeX - g.headX * 0.42 * headWeight) * 0.38 + g.eyeX * 0.12, (g.eyeY * 0.24) - g.headY * 0.1, tmpQ);

    // --- face targets ---
    const target: Record<string, number> = {};
    for (const [k, v] of Object.entries(MOOD_FACE[live.mood] ?? {})) target[k] = v ?? 0;
    if (live.listening) { target.browUp = Math.max(target.browUp ?? 0, 0.22); target.smile = Math.max(target.smile ?? 0, 0.3); }
    if (live.thinking) { target.browInnerUp = 0.45; target.smile = 0; }

    const shut = live.asleep ? 1 : live.blink ? 1 : 0;
    target.blink_L = shut;
    target.blink_R = shut;

    // Lip-sync from loudness: open with the level, vary the mouth shape every syllable, close on pauses.
    const L = lip.current;
    L.level += (live.level - L.level) * Math.min(1, dt * 18);
    if (live.talking) {
      L.t += dt;
      L.shapeT -= dt;
      if (L.shapeT <= 0) { L.shapeT = 0.09 + Math.random() * 0.08; L.shape = MOUTH_SHAPES[Math.floor(Math.random() * MOUTH_SHAPES.length)]; }
      const syllable = 0.55 + 0.45 * Math.abs(Math.sin(L.t * 9.5));
      const open = Math.min(1, L.level * 1.7) * syllable;
      target.viseme_aa = open * 0.75;
      target[L.shape] = (target[L.shape] ?? 0) + open * 0.5;
      if (L.level < 0.06) target.viseme_PP = 0.35;
      target.smile = (target.smile ?? 0) * 0.6;
    }

    // Smooth everything toward its target (blinks snap faster than expressions).
    const cur = face.current;
    for (const k of FACE_KEYS) {
      const goal = target[k] ?? 0;
      const speed = k.startsWith("blink") ? 28 : k.startsWith("viseme") ? 22 : 6;
      const v = (cur[k] ?? 0) + (goal - (cur[k] ?? 0)) * Math.min(1, dt * speed);
      cur[k] = v;
      const slots = rig.morphs.get(k);
      if (slots) for (const s of slots) s.mesh.morphTargetInfluences![s.index] = v;
    }
  });

  return <primitive object={scene} />;
}

/** Add a small world-space yaw (+ = toward screen right) / pitch (+ = down) on top of the animated pose. */
function rotateInWorld(bone: THREE.Object3D, yaw: number, pitch: number, t: { a: THREE.Quaternion; b: THREE.Quaternion; e: THREE.Euler }) {
  if (!bone.parent || (Math.abs(yaw) < 1e-4 && Math.abs(pitch) < 1e-4)) return;
  t.e.set(pitch, yaw, 0, "YXZ");
  const R = t.b.setFromEuler(t.e);
  const pw = bone.parent.getWorldQuaternion(t.a);
  const delta = pw.clone().invert().multiply(R).multiply(pw);
  bone.quaternion.premultiply(delta);
}

/* ------------------------------------------------------------------ */

/** Pause rendering when the character is hidden (tucked away, other screen) to save battery. */
function useVisible(ref: React.RefObject<HTMLElement | null>) {
  const [v, setV] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setV(e.isIntersecting && e.target.getClientRects().length > 0));
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return v;
}

/** If WebGL or the model fails, quietly fall back to the 2D character. */
class WebGLBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.warn("3D character unavailable, using 2D:", e); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function preloadCharacter(v: Variant) {
  useGLTF.preload(MODEL_URL[v]);
}
