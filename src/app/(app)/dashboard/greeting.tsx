"use client";
import { useSyncExternalStore } from "react";

const noop = () => () => {};
function partOfDay() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Greeting by the viewer's local time (the server clock may be in another time zone). */
export function Greeting({ name }: { name: string }) {
  const part = useSyncExternalStore(noop, partOfDay, () => "Welcome");
  return <h1 className="t-page">{part}, {name}</h1>;
}
