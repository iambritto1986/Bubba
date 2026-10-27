import { SignIn, SignUp, useAuth, useClerk, useUser } from "@clerk/react";
import { useEffect, useState } from "react";
import { Bubba, type Mood } from "./components/Bubba";
import { Buddy } from "./components/Buddy";
import { CharacterPicker } from "./components/CharacterPicker";
import { Onboarding } from "./components/Onboarding";
import { Btn, SpeechBubble } from "./components/SpeechBubble";
import { useApi, type Profile } from "./lib/api";
import { isCharacterId, setCharacter, setPicking, useCharacter, usePicking, type CharacterId } from "./lib/characters";
import { setMuted, setVoiceTokenGetter, stopSpeaking, useMuted } from "./lib/voice";
import { bringBack, tuckAway, useTucked } from "./lib/tuck";
import { SIZES, setWindowSize, startDrag } from "./lib/windowCtl";
import { setRenderMode, useRenderMode } from "./lib/renderMode";
import { setWakeEnabled, useWakeEnabled, useWakeStatus } from "./lib/wakeword";

export default function App() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  // Set during render (not in an effect) so it's ready before child components speak.
  setVoiceTokenGetter(isSignedIn ? () => getToken() : null);
  useEffect(() => { if (!isSignedIn) stopSpeaking(); }, [isSignedIn]);
  const [mood, setMood] = useState<Mood>("sleepy");
  const [authMode, setAuthMode] = useState<"signIn" | "signUp">("signIn");
  const [signingIn, setSigningIn] = useState(() => {
    return (
      window.location.hash.length > 1 ||
      window.location.search.includes("__clerk") ||
      sessionStorage.getItem("bubba_signing_in") === "1"
    );
  });

  const openSignIn = () => {
    sessionStorage.setItem("bubba_signing_in", "1");
    setSigningIn(true);
  };

  const closeSignIn = () => {
    sessionStorage.removeItem("bubba_signing_in");
    if (window.location.hash) history.replaceState(null, "", window.location.pathname);
    setSigningIn(false);
  };

  useEffect(() => {
    const big = signingIn && !isSignedIn;
    setWindowSize(big ? SIZES.signIn.width : SIZES.buddy.width, big ? SIZES.signIn.height : SIZES.buddy.height, big);
    if (isSignedIn) {
      sessionStorage.removeItem("bubba_signing_in");
      if (window.location.hash) history.replaceState(null, "", window.location.pathname);
      setSigningIn(false);
    }
  }, [signingIn, isSignedIn]);

  useEffect(() => { if (isLoaded) setMood(isSignedIn ? "happy" : "idle"); }, [isLoaded, isSignedIn]);

  if (signingIn && !isSignedIn) {
    const origin = window.location.origin + "/";
    return (
      <div
        onMouseDown={(e) => e.target === e.currentTarget && e.button === 0 && startDrag()}
        className="flex h-full flex-col items-center justify-center gap-2 overflow-y-auto p-3"
      >
        {authMode === "signUp" ? (
          <SignUp routing="hash" forceRedirectUrl={origin} fallbackRedirectUrl={origin} />
        ) : (
          <SignIn routing="hash" forceRedirectUrl={origin} fallbackRedirectUrl={origin} />
        )}
        <div className="flex items-center gap-2">
          <Btn variant="ghost" onClick={() => setAuthMode(authMode === "signIn" ? "signUp" : "signIn")}>
            {authMode === "signIn" ? "Need an account? Sign up" : "Have an account? Sign in"}
          </Btn>
          <Btn variant="ghost" onClick={closeSignIn}>Back to Bubba</Btn>
        </div>
      </div>
    );
  }

  return (
    <Shell mood={mood}>
      {!isLoaded ? null : isSignedIn ? (
        <SignedInFlow onMood={setMood} />
      ) : (
        <SpeechBubble id="signed-out">
          <p className="text-sm font-semibold leading-snug">Psst! Sign in so I can remember your name and your streaks.</p>
          <div className="mt-2 flex justify-end"><Btn onClick={openSignIn}>Sign in</Btn></div>
        </SpeechBubble>
      )}
    </Shell>
  );
}

function SignedInFlow({ onMood }: { onMood: (m: Mood) => void }) {
  const api = useApi();
  const { user } = useUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const character = useCharacter();
  const picking = usePicking();

  const load = () => {
    setError(null);
    api<Profile>("/api/me")
      .then((p) => { setProfile(p); if (isCharacterId(p.character)) setCharacter(p.character); })
      .catch((e: Error) => { setError(e.message); onMood("oops"); });
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <SpeechBubble id="api-error">
        <p className="text-sm font-semibold">I can't reach my brain (the API): {error}</p>
        <div className="mt-2 flex justify-end"><Btn onClick={load}>Retry</Btn></div>
      </SpeechBubble>
    );
  }
  if (!profile) return null;

  // Step one for everyone: pick a companion (also reachable later from the toolbar).
  if (!isCharacterId(profile.character) || picking) {
    const pick = async (id: CharacterId) => {
      setCharacter(id);
      onMood("cheer");
      setProfile(await api<Profile>("/api/me", { method: "PATCH", body: { character: id } }).catch(() => ({ ...profile, character: id })));
    };
    return <CharacterPicker onPick={pick} onCancel={isCharacterId(profile.character) && character ? () => setPicking(false) : undefined} />;
  }

  if (!profile.displayName) {
    return (
      <Onboarding
        suggested={user?.firstName ?? undefined}
        onSave={async (displayName) => {
          setProfile(await api<Profile>("/api/me", { method: "PATCH", body: { displayName } }));
          onMood("cheer");
        }}
      />
    );
  }
  return <Buddy profile={profile} onMood={onMood} />;
}

/** Bubba at the bottom, his bubble above, a tiny toolbar that shows on hover. Drag Bubba to move the window. */
function Shell({ mood, children }: { mood: Mood; children: React.ReactNode }) {
  const { isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const muted = useMuted();
  const tucked = useTucked();
  const renderMode = useRenderMode();
  const wakeOn = useWakeEnabled();
  const wakeStatus = useWakeStatus();
  const [waking, setWaking] = useState(false);

  const comeBack = () => {
    void bringBack();
    setWaking(true);
    window.setTimeout(() => setWaking(false), 1400);
  };

  return (
    <>
      {/* Tucked away: just his head peeking up from the bottom of the screen. Click to bring him back. */}
      {tucked && (
        <button
          onClick={comeBack}
          title="Bring Bubba back"
          aria-label="Bring Bubba back"
          className="group/peek fixed inset-0 cursor-pointer overflow-hidden bg-transparent"
        >
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[30%] transition-transform duration-300 ease-out group-hover/peek:translate-y-[18%]">
            <Bubba mood={mood === "sleepy" ? "sleepy" : "idle"} size={116} />
          </div>
        </button>
      )}

      {/* Children stay mounted while tucked so the timer and chat keep running. */}
      <div className={`group h-full flex-col items-center justify-end gap-3 p-4 font-sans ${tucked ? "hidden" : "flex"}`}>
        <div className="pointer-events-none fixed right-3 top-3 z-20 flex flex-col items-end gap-1.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
          <div className="flex gap-1">
            <ToolBtn
              label={renderMode === "video" ? "Switch to live 3D (real lip-sync)" : "Switch to video look"}
              onClick={() => setRenderMode(renderMode === "video" ? "3d" : "video")}
            >
              {renderMode === "video" ? "🎬" : "🧊"}
            </ToolBtn>
            {isSignedIn && (
              <ToolBtn
                label={
                  !wakeOn ? "Turn on \"Hey Oliver\" (listens on this PC only)"
                  : wakeStatus === "unavailable" ? "Wake word model not installed yet (run 'Get wake word model.bat')"
                  : wakeStatus === "error" ? "Wake word couldn't use the microphone"
                  : "\"Hey Oliver\" is on (local). Click to turn off"
                }
                onClick={() => setWakeEnabled(!wakeOn)}
              >
                {wakeOn ? (wakeStatus === "listening" || wakeStatus === "paused" ? "👂" : "⚠") : "🔕"}
              </ToolBtn>
            )}
            <ToolBtn label={muted ? "Unmute Bubba" : "Mute Bubba"} onClick={() => setMuted(!muted)}>{muted ? "🔇" : "🔊"}</ToolBtn>
            {isSignedIn && <ToolBtn label="Switch companion" onClick={() => setPicking(true)}>⇄</ToolBtn>}
            {isSignedIn && <ToolBtn label="Sign out" onClick={() => signOut()}>⎋</ToolBtn>}
            <ToolBtn label="Tuck Bubba away" onClick={tuckAway}>–</ToolBtn>
          </div>
        </div>
        <div className="w-full">{children}</div>
        <div onMouseDown={(e) => e.button === 0 && startDrag()} className="cursor-grab active:cursor-grabbing">
          <Bubba mood={waking ? "cheer" : mood} size={175} />
        </div>
      </div>
    </>
  );
}

function ToolBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-full bg-cream/90 text-sm font-bold text-ink/70 shadow ring-1 ring-ink/5 hover:text-ink"
    >
      {children}
    </button>
  );
}
