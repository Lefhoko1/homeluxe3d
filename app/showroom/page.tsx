"use client";

import React from "react";

import { LuxeHomePage } from "../../components/homeluxe";

/**
 * The house.
 *
 * It used to be `/`, which meant a visitor arrived INSIDE a 3D building with
 * no idea what they were looking at or who was behind it. The company's page
 * is the front door now and this is the room behind it.
 *
 * Everything that links here says "the house" or "the showroom" -- the
 * notification emails included, which is why moving it needed a migration
 * rather than only a file rename. See 0020.
 *
 * THIS PAGE, AND ONLY THIS PAGE, DOES NOT SCROLL. `.app-container` is a
 * 100vh grid: header, banner, rooms, the canvas, controls, each a fixed band
 * with the house taking whatever is left. Dragging the page under that would
 * pull the canvas out from under the pointer mid-tour.
 *
 * The lock used to live on <body> in the root layout, where it applied to
 * every page on the site and clipped four of them. It belongs here, and it
 * is put back on the way out -- the visitor pages this links to are ordinary
 * documents and taller than a screen.
 */
export default function ShowroomPage() {
  React.useEffect(() => {
    const previous = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return <LuxeHomePage />;
}
