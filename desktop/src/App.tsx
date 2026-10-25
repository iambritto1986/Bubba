import { SignIn, SignUp, useAuth, useClerk, useUser } from "@clerk/react";
import { useEffect, useState } from "react";
import { Bubba, type Mood } from "./components/Bubba";
import { Buddy } from "./components/Buddy";
import { Onboarding } from "./components/Onboarding";
import { Btn, SpeechBubble } from "./components/SpeechBubble";
import { useApi, type Profile } from "./lib/api";
import { setMuted, setVoiceTokenGetter, stopSpeaking, useMuted } from "./lib/voice";
import { SIZES, hideWindow, setWindowSize, startDrag } from "./lib/windowCtl";

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

  const load = () => {
    setError(null);
    api<Profile>("/api/me").then(setProfile).catch((e: Error) => { setError(e.message); onMood("oops"); });
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
  return (
    <div className="group flex h-full flex-col items-center justify-end gap-3 p-4 font-sans">
      <div className="pointer-events-none fixed right-3 top-3 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
        <ToolBtn label={muted ? "Unmute Bubba" : "Mute Bubba"} onClick={() => setMuted(!muted)}>{muted ? "🔇" : "🔊"}</ToolBtn>
        {isSignedIn && <ToolBtn label="Sign out" onClick={() => signOut()}>⎋</ToolBtn>}
        <ToolBtn label="Hide Bubba" onClick={hideWindow}>–</ToolBtn>
      </div>
      <div className="w-full">{children}</div>
      <div onMouseDown={(e) => e.button === 0 && startDrag()} className="cursor-grab active:cursor-grabbing">
        <Bubba mood={mood} size={170} />
      </div>
    </div>
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
