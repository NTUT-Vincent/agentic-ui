"use client";

import {
  SessionProvider,
  signIn,
  signOut,
  useSession,
} from "next-auth/react";
import Image from "next/image";

function GoogleAuthContent() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <div className="dayflow-auth">Loading...</div>;
  }

  if (!session?.user) {
    return (
      <div className="dayflow-auth">
        <button type="button" onClick={() => signIn("google")}>
          Sign in with Google
        </button>
      </div>
    );
  }

  const user = session.user;

  return (
    <div className="dayflow-auth">
      {user.image && (
        <Image
          src={user.image}
          alt="Profile"
          width={32}
          height={32}
          unoptimized
          className="dayflow-avatar"
        />
      )}
      <div className="dayflow-user-info">
        <strong>{user.name}</strong>
        <small>{user.email}</small>
      </div>
      <button type="button" onClick={() => signOut()}>
        Sign out
      </button>
    </div>
  );
}

export function GoogleAuth() {
  return (
    <SessionProvider>
      <GoogleAuthContent />
    </SessionProvider>
  );
}
