import { SignIn, useAuth, useClerk, useUser } from "@clerk/react";
import { useEffect, useState } from "react";
import { Bubba, type Mood } from "./components/Bubba";
import { Buddy } from "./components/Buddy";
import { Onboarding } from "./components/Onboarding";
import { Btn, SpeechBubble } from "./components/SpeechBubble";
import { useApi, type Profile } from "./lib/api";
import { SIZES, hideWindow, setWindowSize, startDrag } from "./lib/windowCtl";

export default function App() {
  const { isLoaded, isSignedIn } = useAuth();
  const [mood, setMood] = useState<Mood>("sleepy");
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    const big = signingIn && !isSignedIn;
    setWindowSize(big ? SIZES.signIn.width : SIZES.buddy.width, big ? SIZES.signIn.height : SIZES.buddy.height);
    if (isSignedIn) setSigningIn(false);
  }, [signingIn, isSignedIn]);

  useEffect(() => { if (isLoaded) setMood(isSignedIn ? "happy" : "idle"); }, [isLoaded, isSignedIn]);

  if (signingIn && !isSignedIn) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-3">
        <SignIn routing="hash" />
        <Btn variant="ghost" onClick={() => setSigningIn(false)}>Back to Bubba</Btn>
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
          <div className="mt-2 flex justify-end"><Btn onClick={() => setSigningIn(true)}>Sign in</Btn></div>
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
  return (
    <div className="group flex h-full flex-col items-center justify-end gap-3 p-4 font-sans">
      <div className="pointer-events-none fixed right-3 top-3 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
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
