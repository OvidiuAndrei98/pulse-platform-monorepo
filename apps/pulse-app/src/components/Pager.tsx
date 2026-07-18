"use client";

import { useEffect } from "react";
import { motion } from "motion/react";

import { useNavigation } from "@/context/NavigationContext";

import Home from "@/screens/Home";
import Map from "@/screens/Map";
import Chat from "@/screens/Chat";
import Profile from "@/screens/Profile";

export default function Pager() {
  const { page, pagerRef } = useNavigation();

  useEffect(() => {
    if (!pagerRef.current) return;

    pagerRef.current.animate(
      [
        {
          transform: `translateX(-${page * 100}vw)`,
        },
      ],
      {
        duration: 350,
        easing: "cubic-bezier(.22,1,.36,1)",
        fill: "forwards",
      },
    );
  }, [page, pagerRef]);

  return (
    <div className="fixed inset-0 overflow-hidden">
      <motion.div
        ref={pagerRef}
        className="flex h-full w-[400vw]"
        style={{
          transform: `translateX(-${page * 100}vw)`,
        }}
      >
        <div className="h-full w-screen shrink-0 overflow-hidden">
          <Home />
        </div>

        <div className="h-full w-screen shrink-0 overflow-hidden">
          <Map />
        </div>

        <div className="h-full w-screen shrink-0 overflow-hidden">
          <Chat />
        </div>

        <div className="h-full w-screen shrink-0 overflow-hidden">
          <Profile />
        </div>
      </motion.div>
    </div>
  );
}
